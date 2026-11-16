
local ui = tern.ui

local CLEAN = tern.plugin.dir .. "/../../skills/vstack-tmp/scripts/clean.ts"
local SHELL = if tern.runtime.os == "macos" then "/bin/zsh" else (tern.getenv("SHELL") or "/bin/sh")

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
	run_clean({ "--home", state.home, "--older-than", state.age }, function(listing, err)
		if err then
			state.phase, state.error = "error", err
		else
			state.entries, state.kept = listing.entries, listing.kept
			state.phase = if #listing.entries == 0 then "empty" else "list"
		end
		rerender(state)
	end)
end

local function delete(state)
	local rows, total = ticked_rows(state)
	local args = { "--home", state.home, "--older-than", state.age, "--delete" }
	local sizes = {}
	for _, entry in rows do
		table.insert(args, entry.path)
		sizes[entry.path] = entry.size
	end
	state.phase = "deleting"
	state.pending = { count = #rows, size = total }
	run_clean(args, function(result, err)
		if err then
			state.phase, state.error = "error", err .. "\nSome entries may already be deleted."
		else
			local freed = 0
			for _, path in result.deleted do
				freed += sizes[path] or 0
			end
			state.phase = "done"
			state.outcome = { deleted = result.deleted, skipped = result.skipped, freed = freed }
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

local function header(state)
	local parts = { ui.span("Scratch older than " .. state.age, "strong") }
	if state.phase ~= "loading" and state.phase ~= "error" then
		table.insert(parts, ui.span(string.format("  ·  %d expired  ·  %d kept", #state.entries, state.kept or 0), "muted"))
	end
	return ui.text(parts)
end

local function entries_table(state)
	local cols = {
		{ id = "mark", head = "" },
		{ id = "project", head = "Project", truncate = "end", priority = 1 },
		{ id = "kind", head = "Kind", priority = 2 },
		{ id = "entry", head = "Entry", grow = 1, truncate = "middle", priority = 3 },
		{ id = "age", head = "Age", align = "end", mono = true, priority = 2 },
		{ id = "size", head = "Size", align = "end", mono = true, priority = 3 },
	}
	local rows = {}
	for i, entry in state.entries do
		table.insert(rows, {
			id = tostring(i),
			title = entry.path,
			cells = {
				if state.ticked[i] then ui.span("[x]", "strong") else ui.span("[ ]", "muted"),
				entry.repo_key,
				entry.kind,
				entry.entry,
				entry.age_days .. " d",
				human(entry.size),
			},
		})
	end
	return ui.table(cols, rows, { selectable = true, selected = tostring(state.cursor) })
end

local function outcome_view(state)
	local outcome = state.outcome
	local lines = {
		ui.text(ui.span(string.format("Deleted %d %s, freed %s. Skipped %d.", #outcome.deleted,
			if #outcome.deleted == 1 then "entry" else "entries", human(outcome.freed), #outcome.skipped), "strong")),
	}
	for _, path in outcome.deleted do
		table.insert(lines, ui.text({ ui.span("deleted  ", "success"), ui.path(path) }))
	end
	for _, skip in outcome.skipped do
		table.insert(lines, ui.text({ ui.span("skipped  ", "warning"), ui.path(skip.path), ui.span("  " .. skip.reason, "muted") }))
	end
	return ui.col(lines)
end

local function main_view(state)
	local body
	if state.phase == "loading" then
		body = ui.progress(nil, "Reading Scratch…")
	elseif state.phase == "error" then
		body = ui.card("Scratch cleanup failed", { ui.text(state.error) }, { tone = "error" })
	elseif state.phase == "empty" then
		body = ui.text(ui.span("No expired Scratch entries. Nothing to delete.", "muted"))
	elseif state.phase == "deleting" then
		body = ui.progress(nil, string.format("Deleting %d entries…", state.pending.count))
	elseif state.phase == "done" then
		body = outcome_view(state)
	else
		body = entries_table(state)
	end
	return ui.col({ header(state), body })
end

local function dock_view(state)
	local close = ui.button("Close", { variant = "quiet", keys = { "Esc" }, actions = { click = "close" } })
	if state.phase == "list" then
		local rows, total = ticked_rows(state)
		local label = if #rows == 0 then "Nothing ticked" else string.format("%d ticked, %s", #rows, human(total))
		return ui.row({
			ui.text(ui.span(label, "muted")),
			ui.button("Select all", { keys = { "a" }, actions = { click = "select_all" } }),
			ui.button(string.format("Delete %d", #rows), {
				variant = "danger", keys = { "d" }, actions = { click = "delete" },
				disabled = if #rows == 0 then "Tick at least one entry" else nil,
			}),
			close,
		})
	elseif state.phase == "confirm" then
		local rows, total = ticked_rows(state)
		return ui.row({
			ui.text(ui.span(string.format("Delete %d %s, %s? This cannot be undone.", #rows,
				if #rows == 1 then "entry" else "entries", human(total)), "strong error")),
			ui.button("Delete", { variant = "danger", keys = { "Enter" }, actions = { click = "confirm" } }),
			ui.button("Back", { keys = { "Backspace" }, actions = { click = "back" } }),
			ui.button("Close", { variant = "quiet", keys = { "Esc" }, actions = { click = "close" } }),
		})
	elseif state.phase == "deleting" then
		return ui.row({ ui.text(ui.span("Deletion runs to the end even if this popup closes.", "muted")) })
	end
	return ui.row({ close })
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
		-- A region's root is never drawn, so the dock's row sits inside a col.
		return { main = main_view(state), dock = ui.col({ dock_view(state) }) }
	end,

	key = function(state, key, cx)
		local name = key.name
		if name == "escape" then
			act(state, "close", cx)
		elseif state.phase == "confirm" and name == "backspace" then
			act(state, "back", cx)
		elseif state.phase == "confirm" and (name == "enter" or name == "d") then
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
