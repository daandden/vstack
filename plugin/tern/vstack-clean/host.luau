
local ui = tern.ui

local CLEAN = tern.plugin.dir .. "/../../skills/vstack-tmp/scripts/clean.ts"
local SHELL = if tern.runtime.os == "macos" then "/bin/zsh" else (tern.getenv("SHELL") or "/bin/sh")

local KIND_TONES = { "accent", "info", "user" }

local function run_clean(state, args, done)
	local argv = { SHELL, "-lc", 'exec bun "$@"', "vstack-clean", CLEAN,
		"--home", state.home, "--omp-home", state.home, "--witness", state.witness, "--older-than", state.age }
	for _, arg in args do
		table.insert(argv, arg)
	end
	tern.process.run(argv, function(result)
		local ok, value = pcall(tern.json.decode, result.stdout)
		if result.status ~= 0 or not ok or type(value) ~= "table" then
			local why = string.gsub(result.stderr or "", "%s+$", "")
			done(nil, if why ~= "" then why else ("clean.ts exited " .. tostring(result.status)))
		else
			done(value, nil)
		end
	end)
end

local function human(bytes)
	local units = { "B", "KB", "MB", "GB", "TB" }
	local size, unit = bytes, 1
	while size >= 1024 and unit < #units do
		size /= 1024
		unit += 1
	end
	return if unit == 1 then string.format("%d B", size) else string.format("%.1f %s", size, units[unit])
end

local function plural(n, one, many)
	return string.format("%d %s", n, if n == 1 then one else many)
end

local function ttl_seconds(age)
	local n, unit = string.match(age, "^(%d+)([hdw]?)$")
	n = tonumber(n) or 15
	return n * (if unit == "h" then 3600 elseif unit == "w" then 604800 else 86400)
end

local function age_tone(state, seconds)
	local ttl = ttl_seconds(state.age)
	return if seconds >= 3 * ttl then "error" elseif seconds >= 2 * ttl then "warning" else "muted"
end

local function kind_tone(kind)
	local sum = 0
	for i = 1, #kind do
		sum += string.byte(kind, i)
	end
	return KIND_TONES[sum % #KIND_TONES + 1]
end

-- Adds TSP props a builder takes no argument for, such as a row's `justify`.
local function with(node, props)
	node.p = node.p or {}
	for k, v in props do
		node.p[k] = v
	end
	return node
end

local function ticked_rows(state)
	local rows, total = {}, 0
	for i, entry in state.entries do
		if state.ticked[i] then
			table.insert(rows, entry)
			total += entry.size
		end
	end
	return rows, total
end

local function rerender(state)
	pcall(function()
		state.cx:render()
	end)
end

local function load(state)
	state.phase = "loading"
	state.entries, state.ticked, state.cursor = {}, {}, 1
	run_clean(state, {}, function(listing, err)
		if err then
			state.phase, state.error = "error", err
		else
			local entries = listing.rows
			table.sort(entries, function(a, b)
				if a.age_seconds ~= b.age_seconds then
					return a.age_seconds > b.age_seconds
				end
				return a.size > b.size
			end)
			state.entries, state.kept = entries, listing.kept
			state.withheld = listing.withheld
			state.total, state.largest = 0, 0
			for _, entry in entries do
				state.total += entry.size
				state.largest = math.max(state.largest, entry.size)
			end
			state.phase = if #entries == 0 then "empty" else "list"
		end
		rerender(state)
	end)
end

local function delete(state)
	local rows, total = ticked_rows(state)
	local args = { "--delete" }
	for _, entry in rows do
		table.insert(args, entry.snapshot)
	end
	state.ticked = {}
	state.phase = "deleting"
	state.pending = { count = #rows, size = total }
	run_clean(state, args, function(result, err)
		if err then
			state.phase, state.error = "interrupted", err
		else
			state.phase, state.outcome = "done", result
		end
		rerender(state)
	end)
end

local function toggle(state, i)
	if state.entries[i] then
		state.ticked[i] = not state.ticked[i] or nil
		state.cursor = i
	end
end

local function toggle_all(state)
	local all = true
	for i in state.entries do
		all = all and state.ticked[i] == true
	end
	state.ticked = {}
	if not all then
		for i in state.entries do
			state.ticked[i] = true
		end
	end
end

local function ask_delete(state)
	if next(state.ticked) ~= nil then
		state.phase = "confirm"
	end
end

local function list_stats(state)
	local rows, total = ticked_rows(state)
	local oldest = state.entries[1]
	return ui.stats({
		{ label = "Expired", value = tostring(#state.entries), sub = human(state.total) .. " on disk" },
		{ label = "Kept", value = tostring(state.kept or 0), sub = "Too new or protected" },
		{
			label = "Oldest", value = oldest.age_days .. " d", sub = oldest.repo_key,
			tone = "warning",
		},
		{
			label = "Selected", value = tostring(#rows),
			sub = if #rows == 0 then "Nothing ticked" else human(total) .. " to free",
			tone = "accent",
		},
	})
end

local function entries_table(state)
	local cols = {
		{ id = "mark", head = "" },
		{ id = "project", head = "Project", truncate = "end", priority = 1 },
		{ id = "kind", head = "Kind", priority = 2 },
		{ id = "entry", head = "Run or record", grow = 1, truncate = "end", priority = 3 },
		{ id = "age", head = "Age", align = "end", mono = true, priority = 2 },
		{ id = "share", head = "", priority = 1 },
		{ id = "size", head = "Size", align = "end", mono = true, priority = 3 },
	}
	local rows = {}
	for i, entry in state.entries do
		local ticked = state.ticked[i] == true
		table.insert(rows, {
			id = tostring(i),
			title = entry.label,
			cells = {
				if ticked
					then { text = "", icon = "check", tone = "accent", title = "Ticked" }
					else { text = "", icon = "fill-none", tone = "muted", title = "Not ticked" },
				entry.repo_key,
				{ badge = { text = entry.kind, tone = kind_tone(entry.kind) } },
				entry.label,
				{ text = entry.age_days .. " d", dot = age_tone(state, entry.age_seconds) },
				{ meter = { value = if state.largest > 0 then entry.size / state.largest else 0, tone = "accent" } },
				human(entry.size),
			},
		})
	end
	return ui.table(cols, rows, { selectable = true, selected = tostring(state.cursor) })
end

local function hints()
	return ui.text({
		ui.span("Space", "key"), ui.span(" tick  ", "muted"),
		ui.span("↑↓", "key"), ui.span(" or ", "muted"), ui.span("j k", "key"), ui.span(" move  ", "muted"),
		ui.span("a", "key"), ui.span(" all", "muted"),
	})
end

local function confirm_layer(state)
	local rows, total = ticked_rows(state)
	local items = {}
	for _, entry in rows do
		table.insert(items, {
			icon = "trash", tone = "error",
			label = entry.label,
			detail = entry.repo_key .. " / " .. entry.kind,
			value = human(entry.size),
		})
	end
	return ui.node("overlay", {
		key = "confirm",
		head = string.format("Delete %s, %s?", plural(#rows, "row", "rows"), human(total)),
		meta = "This cannot be undone.",
		icon = "warning",
		tone = "error",
		anchor = "center",
		size = "md",
		modal = true,
	}, {
		ui.list(items),
		ui.text(ui.span("Cleanup checks each row again before deleting it.", "muted")),
		with(ui.row({
			ui.button("Back", { keys = { "Backspace" }, actions = { click = "back" } }),
			ui.button("Delete", { variant = "danger", icon = "trash", keys = { "Enter" }, actions = { click = "confirm" } }),
		}), { justify = "end" }),
	})
end

local function outcome_view(state)
	local outcome = state.outcome
	local items, freed = {}, 0
	local function item(row, icon, tone, value)
		table.insert(items, { icon = icon, tone = tone, label = row.label, detail = row.repo_key .. " / " .. row.kind, value = value })
	end
	local function failure(entry)
		table.insert(items, { icon = "error", tone = "error", label = entry.reason, detail = entry.path, title = entry.path })
	end
	for _, row in outcome.deleted do
		freed += row.freed
		item(row, "check", "success", human(row.freed))
	end
	for _, row in outcome.skipped do
		item(row, "warning", "warning", row.reason)
	end
	for _, row in outcome.partial do
		freed += row.freed
		item(row, "warning", "warning", "Partly deleted · " .. human(row.freed))
		for _, entry in row.failed_entries do
			failure(entry)
		end
	end
	for _, entry in outcome.maintenance_errors do
		failure(entry)
	end
	return ui.col({
		ui.stats({
			{ label = "Deleted", value = tostring(#outcome.deleted), tone = if #outcome.deleted > 0 then "success" else nil },
			{ label = "Freed", value = human(freed) },
			{ label = "Skipped", value = tostring(#outcome.skipped), tone = if #outcome.skipped > 0 then "warning" else nil },
			{ label = "Partly deleted", value = tostring(#outcome.partial), tone = if #outcome.partial > 0 then "warning" else nil },
		}),
		ui.text(ui.span(string.format("Deleted %s, freed %s. Skipped %d. Partly deleted %d.",
			plural(#outcome.deleted, "row", "rows"), human(freed), #outcome.skipped, #outcome.partial), "strong")),
		ui.list(items),
	})
end

local function withheld_banner(state)
	if #state.withheld == 0 then
		return nil
	end
	local items, count = {}, 0
	for _, issue in state.withheld do
		count += issue.count
		table.insert(items, { label = issue.reason, value = plural(issue.count, "row", "rows") })
	end
	return ui.card(plural(count, "row", "rows") .. " withheld", { ui.list(items) }, { tone = "warning", icon = "warning" })
end

local function main_view(state)
	if state.phase == "loading" then
		return ui.col({ ui.progress(nil, "Reading Scratch older than " .. state.age .. "…") })
	elseif state.phase == "error" or state.phase == "interrupted" then
		local interrupted = state.phase == "interrupted"
		local details = { ui.code(state.error) }
		if interrupted then
			table.insert(details, ui.text("Some rows may already be deleted. List again to select and confirm remaining rows."))
		end
		table.insert(details, ui.button(if interrupted then "List again" else "Retry", { icon = "refresh", size = "sm", actions = { click = "retry" } }))
		return ui.col({
			ui.card(if interrupted then "Delete did not finish" else "Scratch cleanup failed", details, { tone = "error", icon = "error" }),
		})
	elseif state.phase == "empty" then
		local withheld = withheld_banner(state)
		if withheld then
			return ui.col({ withheld, ui.text(plural(state.kept or 0, "row", "rows") .. " kept. No rows offered.") })
		end
		return ui.col({
			ui.card("Scratch is clean", {
				ui.text(ui.span("No expired Scratch rows. Nothing to delete.", "muted")),
			}, {
				tone = "success", icon = "check",
				meta = string.format("%s kept, none older than %s", plural(state.kept or 0, "row", "rows"), state.age),
			}),
		})
	elseif state.phase == "deleting" then
		return ui.col({
			ui.progress(nil, string.format("Deleting %s, %s…",
				plural(state.pending.count, "row", "rows"), human(state.pending.size))),
		})
	elseif state.phase == "done" then
		return outcome_view(state)
	end
	local content = { list_stats(state), entries_table(state), hints() }
	local withheld = withheld_banner(state)
	if withheld then
		table.insert(content, 1, withheld)
	end
	return ui.col(content)
end

local function close_button()
	return ui.button("Close", { variant = "quiet", keys = { "esc" }, actions = { click = "close" } })
end

local function dock_row(status, actions)
	return with(ui.row({ status, ui.row(actions) }), { justify = "between" })
end

local function dock_view(state)
	if state.phase == "list" then
		local rows, total = ticked_rows(state)
		local summary = if #rows == 0
			then ui.text(ui.span("Nothing ticked", "muted"))
			else ui.text({
				ui.span(string.format("%d of %d selected", #rows, #state.entries), "strong"),
				ui.span("  ·  " .. human(total), "muted"),
			})
		return dock_row(summary, {
			close_button(),
			ui.button(if #rows == #state.entries then "Clear all" else "Select all", { keys = { "a" }, actions = { click = "select_all" } }),
			ui.button(string.format("Delete %d", #rows), {
				variant = "danger", icon = "trash", keys = { "d" }, actions = { click = "delete" },
				disabled = if #rows == 0 then "Tick at least one row" else nil,
			}),
		})
	elseif state.phase == "confirm" then
		return dock_row(ui.text(ui.span("Confirm or go back. Nothing is deleted yet.", "muted")), { close_button() })
	elseif state.phase == "deleting" then
		return dock_row(ui.text(ui.span("Deletion runs to the end even if this popup closes.", "muted")), {})
	end
	return with(ui.row({ close_button() }), { justify = "end" })
end

local function act(state, action, cx)
	if action == "close" then
		cx:exit(0)
	elseif state.phase == "list" and action == "select_all" then
		toggle_all(state)
	elseif state.phase == "list" and action == "delete" then
		ask_delete(state)
	elseif state.phase == "confirm" and action == "confirm" then
		delete(state)
	elseif state.phase == "confirm" and action == "back" then
		state.phase = "list"
	elseif (state.phase == "error" or state.phase == "interrupted") and action == "retry" then
		load(state)
	end
end

tern.block.define("popup", {
	init = function(cx, args, _saved)
		local state = {
			cx = cx, home = args[1], age = args[2] or "15d", witness = args[3] or "",
			phase = "loading", entries = {}, ticked = {}, cursor = 1,
		}
		load(state)
		return state
	end,

	title = function(state)
		return "Scratch cleanup, older than " .. state.age
	end,

	font = "sans",

	view = function(state, _cx)
		-- A region's root is never drawn, so each region's content sits inside a col.
		return {
			main = main_view(state),
			dock = ui.col({ dock_view(state) }),
			layer = if state.phase == "confirm" then ui.col({ confirm_layer(state) }) else nil,
		}
	end,

	key = function(state, key, cx)
		local name = key.name
		if name == "escape" then
			act(state, "close", cx)
		elseif state.phase == "confirm" and name == "backspace" then
			act(state, "back", cx)
		elseif state.phase == "confirm" and name == "enter" then
			act(state, "confirm", cx)
		elseif state.phase ~= "list" then
			return false
		elseif name == "up" or name == "k" then
			state.cursor = math.max(1, state.cursor - 1)
		elseif name == "down" or name == "j" then
			state.cursor = math.min(#state.entries, state.cursor + 1)
		elseif name == "space" then
			toggle(state, state.cursor)
		elseif name == "a" then
			act(state, "select_all", cx)
		elseif name == "enter" or name == "d" then
			act(state, "delete", cx)
		else
			return false
		end
		return true
	end,

	event = function(state, ev, cx)
		if (ev.ev == "select" or ev.ev == "activate") and state.phase == "list" and type(ev.item) == "string" then
			toggle(state, tonumber(ev.item))
		elseif ev.ev == "action" and type(ev.act) == "string" then
			act(state, ev.act, cx)
		end
	end,
})
