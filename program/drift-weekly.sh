#!/bin/zsh
# Weekly version-drift run for cron (Mondays 09:00). Never overwrites a day's result;
# results land uncommitted in program/results/ for the orchestrator to commit and fold into NETER window 5.
cd /Users/manu/JEV-works || exit 1
LOG=runs/drift-weekly.log
today=$(date +%F)
if [[ -e program/results/drift-$today.json ]]; then
  echo "$(date '+%F %T') skip: drift-$today.json already exists" >> $LOG; exit 0
fi
source ~/.zshrc >/dev/null 2>&1          # exports TYPESAFE_API_KEY; never echoed
[[ -n $TYPESAFE_API_KEY ]] || { echo "$(date '+%F %T') FAIL: key not loaded" >> $LOG; exit 1; }
/opt/homebrew/bin/node program/drift.ts >> $LOG 2>&1
echo "$(date '+%F %T') exit $?" >> $LOG
