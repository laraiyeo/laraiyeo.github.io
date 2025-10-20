# PowerShell script to add missing isDarkMode={isDarkMode} props to TeamLogoImage components

param(
    [string]$FilePath
)

if (-not $FilePath) {
    Write-Host "Usage: .\fix-isdarkmode.ps1 -FilePath <path-to-file>"
    exit 1
}

if (-not (Test-Path $FilePath)) {
    Write-Host "File not found: $FilePath"
    exit 1
}

# Read the file content
$content = Get-Content $FilePath -Raw

# Pattern to match TeamLogoImage components that don't already have isDarkMode
# This will match <TeamLogoImage followed by any props that don't include isDarkMode
$pattern = '(<TeamLogoImage\s+[^>]*?)(\s*teamId=.*?)(\s+style=.*?>)'

# Replacement that adds isDarkMode={isDarkMode} before the style prop
$replacement = '$1$2${scriptblock:isDarkMode={isDarkMode}}$3'

# Apply the replacement
$newContent = $content -replace $pattern, { 
    param($match)
    $fullMatch = $match.Groups[0].Value
    
    # Skip if already contains isDarkMode
    if ($fullMatch -match 'isDarkMode') {
        return $fullMatch
    }
    
    # Add isDarkMode before style prop
    $beforeStyle = $match.Groups[1].Value + $match.Groups[2].Value
    $styleAndEnd = $match.Groups[3].Value
    
    return $beforeStyle + "`n                isDarkMode={isDarkMode}" + $styleAndEnd
}

# Write back to file
$newContent | Set-Content $FilePath -NoNewline

Write-Host "Fixed isDarkMode props in $FilePath"