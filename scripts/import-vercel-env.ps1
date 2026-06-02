param(
  [string]$EnvFile = ".env.vercel",
  [ValidateSet("development", "preview", "production")]
  [string]$Environment = "preview",
  [switch]$Sensitive,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  throw "Vercel CLI nao encontrada. Instale com: npm i -g vercel"
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Arquivo nao encontrado: $EnvFile"
}

$lines = Get-Content -LiteralPath $EnvFile

foreach ($line in $lines) {
  $trimmed = $line.Trim()

  if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
    continue
  }

  $parts = $trimmed -split "=", 2
  if ($parts.Count -lt 2) {
    continue
  }

  $name = $parts[0].Trim()
  $value = $parts[1]

  if ([string]::IsNullOrWhiteSpace($name)) {
    continue
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host ("Pulando {0}: valor vazio." -f $name)
    continue
  }

  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tempFile, $value)

    $args = @("env", "add", $name, $Environment)
    if ($Sensitive) { $args += "--sensitive" }
    if ($Force) { $args += "--force" }

    Write-Host "Importando $name para $Environment..."
    Get-Content -LiteralPath $tempFile | & vercel @args
  }
  finally {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  }
}
