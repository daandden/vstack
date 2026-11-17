
local KIND = "vstack-clean.popup"

tern.css("popup", [[
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Scratch cleanup,"] {
	position: fixed !important;
	top: 10vh !important;
	left: max(calc(50vw - 400px * var(--tn-zoom, 1)), calc(24px * var(--tn-zoom, 1))) !important;
	right: auto !important;
	bottom: auto !important;
	width: min(calc(800px * var(--tn-zoom, 1)), calc(100vw - 48px * var(--tn-zoom, 1))) !important;
	height: min(calc(560px * var(--tn-zoom, 1)), calc(80vh)) !important;
	border-radius: calc(16px * var(--tn-zoom, 1));
	background: var(--modal-bg);
	-webkit-backdrop-filter: var(--modal-filter);
	backdrop-filter: var(--modal-filter);
	box-shadow: var(--modal-shadow, 0 0 0 1px var(--l2)), 0 0 0 4000px var(--modal-dim);
}
:root:root:root .tn-pane.pip[aria-label^="Scratch cleanup,"] > .tn-head > :is(.tn-cwd, .tn-git) {
	display: none;
}
.sf-main[data-surface="plugin.vstack-clean.popup"] .sf-tbl-row > .sf-tbl-c:first-child > .sf-tbl-ic {
	width: 1.15em;
	height: 1.15em;
	border-radius: 0.3em;
}
.sf-main[data-surface="plugin.vstack-clean.popup"] .sf-tbl-row > .sf-tbl-c:first-child > .sf-tbl-ic[data-tone="accent"] {
	color: var(--grad-ink);
	background: var(--grad, var(--accent-fill));
}
.sf-main[data-surface="plugin.vstack-clean.popup"] .sf-tbl-row > .sf-tbl-c:first-child > .sf-tbl-ic[data-tone="accent"] .ico {
	width: 0.8em;
	height: 0.8em;
}
]])

-- Popup panes whose first focus has landed; a later focus elsewhere closes them. Which panes are popups is read from
-- the session each time, so a reload or a pane closed by Tern leaves nothing stale.
local settled = {}

local function close_popups(cx, only_settled)
	for _, pane in cx.session:panes() do
		if pane.block == KIND and (not only_settled or settled[pane.pane]) then
			settled[pane.pane] = nil
			cx.layout:close(pane.pane)
		end
	end
end

local function tiled_owner(cx, pane)
	local tab = cx.session:tab_of(pane)
	local layout = if tab then cx.session:layout(tab) else nil
	for _, float in (if layout then layout.floats else {}) do
		if float.pane == pane then
			return float.over
		end
	end
	return pane
end

local function open_popup(cx, caller, home, age)
	close_popups(cx, false)
	local owner = if cx.session:pane(caller) then caller else cx.session:focused()
	if owner == nil then
		cx:toast("error", "Could not open Scratch cleanup", "No pane to float over.")
		return
	end
	owner = tiled_owner(cx, owner)
	local pane = cx.layout:split(owner, "right", { block = KIND, args = { home, age } }, { focus = false })
	if pane == nil then
		cx:toast("error", "Could not open Scratch cleanup", "The vstack-clean plugin is not loaded on this host.")
		return
	end
	local ok, why = cx.layout:float(pane, owner, "br", { focus = true })
	if not ok then
		cx.layout:close(pane)
		cx:toast("error", "Could not open Scratch cleanup", tostring(why))
		return
	end
	cx.layout:focus(pane)
	-- Tern returns focus to the pane that ran `tern open` after this route returns, so focus the popup once more
	-- 60 ms later and only then let a focus elsewhere close it. The wait is a process, not tern.timer: in an idle
	-- window tern.timer fires only at the next input, so the first key would land in the caller.
	tern.process.run({ "/bin/sleep", "0.06" }, function(_result, later)
		if later and later.session:pane(pane) then
			later.layout:focus(pane)
			settled[pane] = true
		end
	end)
end

tern.route.open(function(request, cx)
	local home, caller, age = string.match(request.path, "^(.+)/%.vstack/clean%-popup/(%d+)/(%d+[hdw]?)$")
	if home == nil then
		return nil
	end
	open_popup(cx, tonumber(caller), home, age)
	return { handled = true }
end)

tern.on("focus", function(ev, cx)
	local info = cx.session:pane(ev.pane)
	if info == nil or info.block ~= KIND then
		close_popups(cx, true)
	end
end)

tern.on("pane_closed", function(ev, _cx)
	settled[ev.pane] = nil
end)

tern.timer(0, function(cx)
	if cx then
		close_popups(cx, false)
	end
end)
