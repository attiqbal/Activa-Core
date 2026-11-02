#!/usr/bin/env bash
# Starts a throwaway Postgres, applies the migration, and proves customers cannot see each other's rows.
set -eu
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); chmod 777 "$DIR"
RUN="runuser -u postgres --"
$RUN $BIN/initdb -D "$DIR/data" -A trust >/dev/null
$RUN $BIN/pg_ctl -D "$DIR/data" -o "-p 54329 -k $DIR" -l "$DIR/log" -w start >/dev/null
trap '$RUN $BIN/pg_ctl -D "$DIR/data" -m immediate stop >/dev/null; rm -rf "$DIR"' EXIT
P="psql -h $DIR -p 54329 -v ON_ERROR_STOP=1 -q -t -A"
$RUN $P -U postgres -d postgres -f "$(dirname "$0")/001_init.sql" >/dev/null
A=11111111-1111-1111-1111-111111111111; B=22222222-2222-2222-2222-222222222222
app() { $RUN $P -U app_user -d postgres "$@"; }
app -c "INSERT INTO workspaces(id,name) VALUES ('$A','A')" 2>&1 | grep -qi "permission denied\|row-level" && echo "ok: customer role cannot create workspaces" || { echo FAIL create; app -c "INSERT INTO workspaces(id,name) VALUES ('$A','A')" 2>&1; exit 1; }
# the platform (owner role) provisions both customers
$RUN $P -U postgres -d postgres -c "INSERT INTO workspaces(id,name) VALUES ('$A','A'),('$B','B')"
app <<SQL >/dev/null
BEGIN; SELECT set_config('app.workspace_id','$A',true);
INSERT INTO journal_entries(id,workspace_id,entry_date,memo) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','$A','2026-01-01','sale');
INSERT INTO journal_lines VALUES ('aaaaaaaa-0000-0000-0000-000000000001','$A','1000',100,0),('aaaaaaaa-0000-0000-0000-000000000001','$A','4000',0,100);
COMMIT;
SQL
seen=$(app -c "BEGIN; SELECT set_config('app.workspace_id','$B',true); SELECT count(*) FROM journal_entries; COMMIT;" | tail -1)
[ "$seen" = "0" ] && echo "ok: workspace B sees 0 of A's entries" || { echo "FAIL leak: $seen"; exit 1; }
none=$(app -c "SELECT count(*) FROM journal_entries")
[ "$none" = "0" ] && echo "ok: no workspace declared sees nothing" || { echo FAIL; exit 1; }
app -c "BEGIN; SELECT set_config('app.workspace_id','$B',true); INSERT INTO employees VALUES (gen_random_uuid(),'$A','x','y');" 2>&1 | grep -q "row-level" && echo "ok: B cannot write into A" || { echo FAIL write; exit 1; }
app -c "BEGIN; SELECT set_config('app.workspace_id','$A',true); INSERT INTO journal_entries VALUES ('aaaaaaaa-0000-0000-0000-000000000002','$A','2026-01-02','bad',null,null,now()); INSERT INTO journal_lines VALUES ('aaaaaaaa-0000-0000-0000-000000000002','$A','1000',5,0); COMMIT;" 2>&1 | grep -q "does not balance" && echo "ok: unbalanced entry rejected" || { echo FAIL balance; exit 1; }
app -c "BEGIN; SELECT set_config('app.workspace_id','$A',true); DELETE FROM journal_entries;" 2>&1 | grep -qi "permission denied\|append-only" && echo "ok: books cannot be deleted" || { echo FAIL delete; exit 1; }
echo "all isolation checks passed"
