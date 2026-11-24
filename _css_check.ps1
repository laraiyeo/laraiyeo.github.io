$css = Get-Content "c:\live-sports-tracker\nfl\style.css"
$split = 1361
$classes = @(
  'sb-teams-row','sb-status-center','sb-status-top','sb-status-bottom',
  'sb-logo-score-row','sb-team-score','sb-team-record','sb-team-link',
  'sb-league-row','sb-card','sb-card-header','sb-card-title','sb-card-body',
  'sb-scoring-row','sb-scoring-time','sb-scoring-info','sb-official-row',
  'sb-weather-row','sb-venue-card','sb-venue-name','sb-linescore','sb-ls-grid',
  'sb-field-svg','sb-drives-wrap','sb-drive-banner','sb-drive-play-card',
  'sb-team-wrap','sb-pos-bar','sb-leader-row','sb-pred-bar','sb-pm-headshot',
  'sb-sticky-status-block','sb-poss-badge','sb-down-row','sb-last5-badge',
  'sb-stats-row','sb-stats-bar','sb-drive-chip','sb-pos-chip','sb-leader-cat'
)
$out = @()
foreach ($c in $classes) {
  $hits = @()
  for ($i = 0; $i -lt $css.Count; $i++) {
    if ($css[$i] -match ('^\.' + [regex]::Escape($c) + '\s*\{')) { $hits += ($i + 1) }
  }
  $inNew = @($hits | Where-Object { $_ -gt $split }).Count
  $status = if ($inNew -gt 0) { 'OK' } elseif ($hits.Count -gt 0) { 'OLD-ONLY' } else { 'MISSING' }
  $out += ('{0,-24} {1,-9} {2}' -f $c, $status, ($hits -join ','))
}
$out | Out-File -FilePath "c:\live-sports-tracker\_css_check.txt" -Encoding utf8
Write-Host "done"
