#!/bin/bash
set -eu
parent_pid="$1"
target="$2"
staged="$3"
backup="$4"
result="$5"
fail() {
    printf '%s\n' "$1" > "$result"
    exit 1
}
count=0
while kill -0 "$parent_pid" 2>/dev/null; do
    count=$((count + 1))
    [ "$count" -lt 120 ] || fail 'Update cancelled: app did not close within 120 seconds.'
    sleep 1
done
[ -d "$target" ] && [ -d "$staged" ] || fail 'Update cancelled: application bundle is missing.'
[ ! -e "$backup" ] || fail 'Update cancelled: backup path already exists.'
/bin/mv "$target" "$backup" || fail 'Could not move the installed app. Check folder permissions.'
if ! /bin/mv "$staged" "$target"; then
    /bin/mv "$backup" "$target" || fail 'Update failed; restore the app from the backup path.'
    /usr/bin/open -n "$target" || true
    fail 'Update failed; the previous app was restored.'
fi
if ! /usr/bin/open -n "$target"; then
    /bin/mv "$target" "$staged" || fail 'Could not launch the update. Previous app is in the backup path.'
    /bin/mv "$backup" "$target" || fail 'Could not restore the previous app from backup.'
    /usr/bin/open -n "$target" || true
    fail 'Could not launch the update; the previous app was restored.'
fi
printf 'Updated successfully. Previous app backup: %s\n' "$backup" > "$result"
