
local ui = tern.ui

local CLEAN = tern.plugin.dir .. "/../../skills/vstack-tmp/scripts/clean.ts"
local SHELL = if tern.runtime.os == "macos" then "/bin/zsh" else (tern.getenv("SHELL") or "/bin/sh")

local KIND_TONES = { "accent", "info", "user" }

local function run_clean(args, done)
	local argv = { SHELL, "-lc", 'exec bun "$@"', "vstack-clean", CLEAN }
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

-- Seconds since the Unix epoch of an ISO 8601 time in UTC (`Z`) or with an offset, as clean.ts and Flow state
-- write them. The day count is Howard Hinnant's days_from_civil.
local function epoch_seconds(iso)
	local y, mo, d, h, mi, s, zone = string.match(iso, "^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)[%.%d]*(.*)$")
	y, mo = tonumber(y), tonumber(mo)
	if mo <= 2 then
		y -= 1
	end
	local era = y // 400
	local yoe = y - era * 400
	local doy = (153 * ((mo + 9) % 12) + 2) // 5 + tonumber(d) - 1
	local days = era * 146097 + yoe * 365 + yoe // 4 - yoe // 100 + doy - 719468
	local seconds = days * 86400 + tonumber(h) * 3600 + tonumber(mi) * 60 + tonumber(s)
	local sign, oh, om = string.match(zone, "^([+-])(%d%d):?(%d%d)$")
	if sign then
		local offset = tonumber(oh) * 3600 + tonumber(om) * 60
		seconds -= if sign == "+" then offset else -offset
	end
	return seconds
end

-- A closed Flow ages from its close, every other entry from its newest file, as clean.ts measures them.
local function age_seconds(entry, now)
	return now - epoch_seconds(entry.closed or entry.newest_mtime)
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
	state.ticked, state.cursor = {}, 1
	run_clean({ "--home", state.home, "--older-than", state.age }, function(listing, err)
		if err then
			state.phase, state.error = "error", err
		else
			local entries, now = listing.entries, os.time()
			for _, entry in entries do
				entry.age_seconds = age_seconds(entry, now)
			end
			table.sort(entries, function(a, b)
				if a.age_seconds ~= b.age_seconds then
					return a.age_seconds > b.age_seconds
				end
				return a.size > b.size
			end)
			state.entries, state.kept = entries, listing.kept
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
	local args = { "--home", state.home, "--older-than", state.age, "--delete" }
	local by_path = {}
	for _, entry in rows do
		table.insert(args, entry.path)
		by_path[entry.path] = entry
	end
	state.phase = "deleting"
	state.pending = { count = #rows, size = total }
	run_clean(args, function(result, err)
		if err then
			state.phase, state.error = "error", err .. "\nSome entries may already be deleted."
		else
			local freed = 0
			for _, path in result.deleted do
				freed += if by_path[path] then by_path[path].size else 0
			end
			state.phase = "done"
			state.outcome = { deleted = result.deleted, skipped = result.skipped, freed = freed, by_path = by_path }
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
		{ label = "Kept", value = tostring(state.kept or 0), sub = "Newer, or an open Flow" },
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
		{ id = "entry", head = "Entry", grow = 1, truncate = "middle", mono = true, priority = 3 },
		{ id = "age", head = "Age", align = "end", mono = true, priority = 2 },
		{ id = "share", head = "", priority = 1 },
		{ id = "size", head = "Size", align = "end", mono = true, priority = 3 },
	}
	local rows = {}
	for i, entry in state.entries do
		local ticked = state.ticked[i] == true
		table.insert(rows, {
			id = tostring(i),
			title = entry.path,
			cells = {
				if ticked
					then { text = "", icon = "check", tone = "accent", title = "Ticked" }
					else { text = "", icon = "fill-none", tone = "muted", title = "Not ticked" },
				entry.repo_key,
				{ badge = { text = entry.kind, tone = kind_tone(entry.kind) } },
				entry.entry,
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
			label = ui.span(entry.entry, "mono"),
			detail = entry.repo_key .. " / " .. entry.kind,
			value = human(entry.size),
		})
	end
	return ui.node("overlay", {
		key = "confirm",
		head = string.format("Delete %s, %s?", plural(#rows, "entry", "entries"), human(total)),
		meta = "This cannot be undone.",
		icon = "warning",
		tone = "error",
		anchor = "center",
		size = "md",
		modal = true,
	}, {
		ui.list(items),
		ui.text(ui.span("Each entry is checked against " .. state.age .. " again before it is deleted.", "muted")),
		with(ui.row({
			ui.button("Back", { keys = { "Backspace" }, actions = { click = "back" } }),
			ui.button("Delete", { variant = "danger", icon = "trash", keys = { "Enter" }, actions = { click = "confirm" } }),
		}), { justify = "end" }),
	})
end

local function outcome_view(state)
	local outcome = state.outcome
	local items = {}
	local function label(path)
		local entry = outcome.by_path[path]
		if entry then
			return ui.span(entry.entry, "mono"), entry.repo_key .. " / " .. entry.kind, entry
		end
		return ui.path(path), nil, nil
	end
	for _, path in outcome.deleted do
		local text, detail, entry = label(path)
		table.insert(items, {
			icon = "check", tone = "success", label = text, detail = detail,
			value = if entry then human(entry.size) else nil,
		})
	end
	for _, skip in outcome.skipped do
		local text, detail = label(skip.path)
		table.insert(items, { icon = "warning", tone = "warning", label = text, detail = detail, value = ui.span(skip.reason, "warning") })
	end
	return ui.col({
		ui.stats({
			{ label = "Deleted", value = tostring(#outcome.deleted), tone = if #outcome.deleted > 0 then "success" else nil },
			{ label = "Freed", value = human(outcome.freed) },
			{ label = "Skipped", value = tostring(#outcome.skipped), tone = if #outcome.skipped > 0 then "warning" else nil },
		}),
		ui.text(ui.span(string.format("Deleted %s, freed %s. Skipped %d.",
			plural(#outcome.deleted, "entry", "entries"), human(outcome.freed), #outcome.skipped), "strong")),
		ui.list(items),
	})
end

local function main_view(state)
	if state.phase == "loading" then
		return ui.col({ ui.progress(nil, "Reading Scratch older than " .. state.age .. "…") })
	elseif state.phase == "error" then
		return ui.col({
			ui.card("Scratch cleanup failed", {
				ui.code(state.error),
				ui.button("Retry", { icon = "refresh", size = "sm", actions = { click = "retry" } }),
			}, { tone = "error", icon = "error" }),
		})
	elseif state.phase == "empty" then
		return ui.col({
			ui.card("Scratch is clean", {
				ui.text(ui.span("No expired Scratch entries. Nothing to delete.", "muted")),
			}, {
				tone = "success", icon = "check",
				meta = string.format("%s kept, none older than %s", plural(state.kept or 0, "entry", "entries"), state.age),
			}),
		})
	elseif state.phase == "deleting" then
		return ui.col({
			list_stats(state),
			ui.progress(nil, string.format("Deleting %s, %s…",
				plural(state.pending.count, "entry", "entries"), human(state.pending.size))),
		})
	elseif state.phase == "done" then
		return outcome_view(state)
	end
	return ui.col({ list_stats(state), entries_table(state), hints() })
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
				disabled = if #rows == 0 then "Tick at least one entry" else nil,
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
	elseif state.phase == "error" and action == "retry" then
		load(state)
	end
end

tern.block.define("popup", {
	init = function(cx, args, _saved)
		local state = {
			cx = cx, home = args[1], age = args[2] or "15d",
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
