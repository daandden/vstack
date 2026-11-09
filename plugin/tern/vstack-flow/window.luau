
local CAPABILITY = string.rep("%x", 64)

local function flow_key(url)
	local key, host, rest =
		string.match(url, "^(http://([^/?#:@]+):?%d*/f/[^/?#]+/[^/?#]+/" .. CAPABILITY .. "/)(.*)$")
	if key == nil or (rest ~= "" and string.sub(rest, 1, 1) ~= "#") then
		return nil
	end
	host = string.lower(host)
	if host ~= "127.0.0.1" and host ~= "localhost" then
		return nil
	end
	return key
end

local function tiled_owner_for_beside_docking(cx, pane)
	local tab = cx.session:tab_of(pane)
	local layout = if tab then cx.session:layout(tab) else nil
	for _, float in (if layout then layout.floats else {}) do
		if float.pane == pane then
			return float.over
		end
	end
	return pane
end

local function open_page(cx, tab, key)
	for _, pane in cx.session:panes() do
		if pane.kind == "browser" and pane.tab == tab and pane.url and flow_key(pane.url) == key then
			return pane.pane
		end
	end
	return nil
end

local function report(failure, result, err, later)
	local why = err or (result and result.error and result.error.message)
	if why and later then
		later:toast("error", failure, tostring(why))
	end
end

local function navigate_preserving_active_draft(cx, page, target)
	local info = cx.session:pane(page)
	local same = info and info.url == target
	local request = if same
		then {
			op = "eval", block = page,
			["function"] = "() => window.dispatchEvent(new HashChangeEvent('hashchange'))",
		}
		else { op = "goto", block = page, url = target }
	cx.browser:call(request):next(function(reply, why, fresh)
		report("Could not follow the omp session", reply, why, fresh)
		if same and fresh then
			fresh.browser:call({ op = "release", block = page })
		end
	end)
end

local selected = {}
local focused = {}
local busy = false

local function poll(cx)
	if busy then
		return
	end
	local events = focused
	local event_count = #events
	local wanted = {}
	for _, event in events do
		wanted[event.pane] = true
	end
	for tab, state in selected do
		if cx.session:tab_of(state.pane) == tab then
			wanted[state.pane] = true
		else
			selected[tab] = nil
		end
	end
	local argv = {
		if tern.runtime.os == "macos" then "/bin/zsh" else (tern.getenv("SHELL") or "/bin/sh"),
		"-lc", 'exec bun "$@"', "vstack-flow", tern.plugin.dir .. "/targets.ts",
	}
	for pane in wanted do
		table.insert(argv, tostring(pane))
	end
	if next(wanted) == nil then
		return
	end
	busy = true
	local started, err = pcall(function()
		tern.process.run(argv, { timeout_ms = 4000 }, function(result, later)
			busy = false
			if not later or result.status ~= 0 then
				return
			end
			local ok, rows = pcall(tern.json.decode, result.stdout)
			if not ok then
				return
			end
			local by_pane = {}
			for _, row in rows do
				by_pane[row.pane] = row
			end
			for i = 1, event_count do
				local event = events[i]
				local row = by_pane[event.pane]
				if row and row.session_file and later.session:tab_of(event.pane) == event.tab then
					local state = selected[event.tab]
					if not state or state.pane ~= event.pane then
						selected[event.tab] = { pane = event.pane }
					end
				end
			end
			for _ = 1, event_count do
				table.remove(focused, 1)
			end
			for tab, state in selected do
				local row = by_pane[state.pane]
				if not row or later.session:tab_of(state.pane) ~= tab then
					continue
				end
				local changed = row.session ~= state.session
				local opened = row.queried and row.picker and row.picker ~= state.picker
				if row.queried then
					state.session = row.session
					state.picker = row.picker
				end
				if (changed or opened) and row.target then
					local key = flow_key(row.target)
					local page = if key then open_page(later, tab, key) else nil
					if page then
						navigate_preserving_active_draft(later, page, row.target)
					end
				end
			end
		end)
	end)
	if not started then
		busy = false
		tern.log.warn("Could not query Flow targets", err)
	end
end

tern.on("focus", function(event, cx)
	table.insert(focused, { pane = event.pane, tab = event.tab })
	poll(cx)
end)

local function tick(cx)
	poll(cx)
	tern.timer(500, tick)
end

tern.on("window_start", function(cx)
	local pane = cx.session:focused()
	local tab = if pane then cx.session:tab_of(pane) else nil
	if tab then
		table.insert(focused, { pane = pane, tab = tab })
	end
	poll(cx)
end)

tern.timer(500, tick)

tern.route.link(function(link, cx)
	if link.mods.alt then
		return nil
	end
	local key = flow_key(link.url)
	if key == nil then
		return nil
	end
	local owner = tiled_owner_for_beside_docking(cx, link.pane)
	local page = open_page(cx, cx.session:tab_of(owner), key)
	if page then
		cx.browser:call({ op = "goto", block = page, url = link.url }):next(function(result, err, later)
			report("Could not show the question", result, err, later)
		end)
		cx.layout:focus(page)
	else
		cx.browser:call({ op = "open", owner = owner, url = link.url, how = "beside" }):next(function(result, err, later)
			report("Could not open the Flow page", result, err, later)
			local block = result and result.ok and result.ok.block
			if block and later then
				later.browser:call({ op = "release", block = block })
			end
		end)
	end
	return { handled = true }
end)
