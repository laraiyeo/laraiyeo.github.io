$ErrorActionPreference = "Stop"
$gd = Invoke-RestMethod -Uri "https://sportsheart-hockey.up.railway.app/nhl/game/2026020185" -TimeoutSec 30
$d = $gd.data
function Show($label, $obj, $max) {
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  if ($max -and $json.Length -gt $max) { $json = $json.Substring(0, $max) + " ..." }
  Write-Host "=== $label ==="
  Write-Host $json
  Write-Host ""
}
Show "play[0]" $d.plays.plays[0] 1000
Show "rosterSpot[0]" $d.plays.rosterSpots[0] 400
Show "pbgs away forwards[0]" $d.boxscore.playerByGameStats.awayTeam.forwards[0] 800
Show "pbgs away goalies[0]" $d.boxscore.playerByGameStats.awayTeam.goalies[0] 800
Show "teamGameStats[0..1]" (@($d.rightRail.teamGameStats | Select-Object -First 2)) 700
Show "teamSeasonStats keys" ($d.rightRail.teamSeasonStats.PSObject.Properties.Name) 400
Show "linescore byPeriod" $d.rightRail.linescore.byPeriod 500
Show "seasonSeries[0]" $d.rightRail.seasonSeries[0] 700
Show "skaterComparison" $d.landing.matchup.skaterComparison 900
Show "goalieComparison away leaders[0]" $d.landing.matchup.goalieComparison.awayTeam.leaders[0] 700
Show "shifts keys" ($d.shifts.PSObject.Properties.Name) 200
$teamKey = ($d.shifts.PSObject.Properties.Name)[0]
Show "shifts[$teamKey][0]" $d.shifts.$teamKey[0] 600
Show "scoring[0].goals[0]" $d.landing.summary.scoring[0].goals[0] 700
Show "iceSurface" $d.landing.summary.iceSurface 700
Show "rightRail gameInfo" (@{referees=$d.rightRail.gameInfo.referees; linesmen=$d.rightRail.gameInfo.linesmen; awayScratches=@($d.rightRail.gameInfo.awayTeam.scratches).Count}) 500
Show "penalties[0]" $d.landing.summary.penalties[0] 500
