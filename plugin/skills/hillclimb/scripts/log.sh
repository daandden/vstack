#!/usr/bin/env bash
# Usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>
set -euo pipefail

if [ "$#" -ne 6 ]; then
	printf 'usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
	exit 1
fi

logfile="$1"
shift

logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
	mkdir -p "$logdir"
fi

append_header_if_empty() {
	if [ ! -s "$logfile" ]; then
		printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >> "$logfile"
	fi
}

single_line_formula_safe_cell() {
	local v
	v=$(printf '%s' "$1" | tr '\t\n\r' '   ')
	case "$v" in
		=*|+*|-*|@*) printf "'%s" "$v" ;;
		*) printf '%s' "$v" ;;
	esac
}

append_header_if_empty
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$ts" \
	"$(single_line_formula_safe_cell "$1")" \
	"$(single_line_formula_safe_cell "$2")" \
	"$(single_line_formula_safe_cell "$3")" \
	"$(single_line_formula_safe_cell "$4")" \
	"$(single_line_formula_safe_cell "$5")" \
	>> "$logfile"