$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

$services = @(
  @{
    Name = "backend"
    Path = Join-Path $root "wash-and-go-backend"
    Args = @("run", "start:dev")
  },
  @{
    Name = "frontend"
    Path = Join-Path $root "wash-and-go-SE2"
    Args = @("run", "dev")
  }
)

$jobs = @()

function Show-ServiceOutput {
  param (
    [string] $Name,
    [object[]] $Output
  )

  foreach ($line in $Output) {
    if ($null -ne $line -and "$line".Trim().Length -gt 0) {
      Write-Host "[$Name] $line"
    }
  }
}

try {
  foreach ($service in $services) {
    $job = Start-Job -Name "wash-go-$($service.Name)" -ScriptBlock {
      param($WorkingDirectory, $NpmArgs)

      Set-Location $WorkingDirectory
      & npm.cmd @NpmArgs 2>&1
    } -ArgumentList $service.Path, $service.Args

    $jobs += [pscustomobject]@{
      Name = $service.Name
      Job = $job
    }
  }

  Write-Host "Started backend on http://localhost:3001/api"
  Write-Host "Started frontend on http://localhost:3000"
  Write-Host "Press Ctrl+C to stop both."

  while ($true) {
    foreach ($entry in $jobs) {
      $output = Receive-Job -Job $entry.Job
      Show-ServiceOutput -Name $entry.Name -Output $output

      if ($entry.Job.State -ne "Running") {
        $remaining = Receive-Job -Job $entry.Job
        Show-ServiceOutput -Name $entry.Name -Output $remaining
        throw "$($entry.Name) stopped with state $($entry.Job.State)."
      }
    }

    Start-Sleep -Milliseconds 250
  }
}
finally {
  foreach ($entry in $jobs) {
    if ($entry.Job.State -eq "Running") {
      Stop-Job -Job $entry.Job
    }

    Remove-Job -Job $entry.Job -Force
  }
}
