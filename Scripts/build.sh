#!/usr/bin/env bash
set -euo pipefail

repositoryRoot="$(cd "$(dirname "$0")/.." && pwd)"
siteFolder="$repositoryRoot/build/site"
cd "$repositoryRoot"

syntaxLog=$(mktemp)
moduleCount=0
for module in $(find Apps/web Shared -name '*.js' -not -path '*/Tests/*'); do
  if ! node --check "$module" >> "$syntaxLog" 2>&1; then
    cat "$syntaxLog"
    echo "Syntax check failed: node --check $module"
    exit 1
  fi
  moduleCount=$((moduleCount + 1))
done
echo "Syntax check: passed ($moduleCount modules)"

rm -rf "$siteFolder"
mkdir -p "$siteFolder/Apps/web"
for part in App Engine Features Scenes; do cp -R "Apps/web/$part" "$siteFolder/Apps/web/$part"; done
cp -R Shared "$siteFolder/Shared"
rm -rf "$siteFolder/Shared/Tests"
sed -e 's#href="Features/#href="Apps/web/Features/#' -e 's#src="App/#src="Apps/web/App/#' Apps/web/index.html > "$siteFolder/index.html"
{
  sed -n '/<title>/p' "$siteFolder/index.html"
  echo '<style>'
  cat Apps/web/Features/Settings/SettingsPanel.css
  echo '</style>'
  sed -n '/<body>/,/<\/body>/p' "$siteFolder/index.html" | grep -v '</\?body>'
} > "$siteFolder/artifact-page.html"
echo "Site: build/site ($(find "$siteFolder" -type f | wc -l | tr -d ' ') files)"
