# Capture existing daily_briefing USB diagnostics without uploading firmware or
# sending commands to ESP. Only recognized, bounded fields enter the JSONL file.
param(
    [ValidatePattern('^(COM[0-9]{1,3})?$')][string]$Port = '',
    [ValidateRange(5,3600)][int]$Seconds = 90,
    [string]$OutputPath = '',
    [string]$ReplayPath = ''
)
$ErrorActionPreference = 'Stop'
$voxSession = [Guid]::NewGuid().ToString('N').Substring(0,16)
$script:voxSequence = 0
$script:voxStage = 'device'
if (!$OutputPath) {
    $voxDirectory = Join-Path $PSScriptRoot '../data/diagnostics'
    $OutputPath = Join-Path $voxDirectory ("device-{0}-{1}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss'),$voxSession.Substring(0,4))
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $OutputPath) { throw 'Output file already exists; choose a new filename.' }
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($OutputPath)) | Out-Null
$voxWriter = [IO.StreamWriter]::new($OutputPath,$false,[Text.UTF8Encoding]::new($false))
$voxWriter.AutoFlush = $true

function Write-VoxLine([string]$Line) {
    $voxFields = @{}
    if ($Line -match '^\[PART SEND\] index=([0-9]{1,3}) bytes=([0-9]{1,5}) fetch_ms=([0-9]{1,10}) preloaded=([01])(?: frame_interval_ms=([0-9]{1,10}))?') {
        $voxFields = @{stage='speech';code='part_sent';part=[int]$Matches[1];bytes=[int]$Matches[2];fetch_ms=[long]$Matches[3];preload=[int]$Matches[4]}
        if ($Matches[5]) { $voxFields.frame_interval_ms=[long]$Matches[5] }
    } elseif ($Line -match '^estimated_wait_ms=([0-9]{1,6})$') {
        $voxFields = @{stage='speech';code='wait_estimate';wait_ms=[int]$Matches[1]}
    } elseif ($Line -match '^\[VOICE RATE\] ms_per_char=([0-9]{3})$') {
        $voxFields = @{stage='speech';code='voice_rate';rate=[int]$Matches[1]}
    } elseif ($Line -match '^\[SYNC DETAIL\] stage=([1-7]) request_ms=([0-9]{1,10}) http_status=([0-9]{1,3})$') {
        $voxStageName = @('device','uart','wifi','tcp','send','http','sync','sync')[[int]$Matches[1]]
        $voxCode = if ($Matches[1] -eq '7') {'slow_response'} elseif ($Matches[1] -eq '6') {'invalid_plan'} else {'protocol_error'}
        $voxFields = @{stage=$voxStageName;code=$voxCode;elapsed_ms=[long]$Matches[2];http_status=[int]$Matches[3];ok=$false}
    } elseif ($Line -match '^\[AT\] (AT|ATE0)$') {
        $script:voxStage = 'uart'; $voxFields = @{code='command';command=$Matches[1]}
    } elseif ($Line -match '^\[AT\] AT\+(CWMODE|CWAUTOCONN|CWJAP|CIFSR|CIPSTART|CIPSEND|CIPCLOSE|CIPMODE|CIPMUX|CIPDINFO|CIPRECVMODE)(?:=|$)') {
        $voxCommand = $Matches[1]
        $script:voxStage = switch ($voxCommand) {
            { $_ -in 'CWAUTOCONN','CWJAP','CIFSR' } {'wifi';break}
            'CIPSTART' {'tcp';break}
            'CIPSEND' {'send';break}
            default {'uart'}
        }
        if ($voxCommand -eq 'CWAUTOCONN') { $voxCommand = 'AUTOCONN' }
        $voxFields = @{code='command';command=$voxCommand}
    } elseif ($Line -match '^\[ERROR\] ESP:') {
        $voxFields = @{code=$(if ($Line -match 'response timed out') {'timeout'} else {'esp_error'});ok=$false}
    } elseif ($Line -match '^\[ERROR\] HTTP status=([0-9]{1,3}); received text bytes=([0-9]{1,5});') {
        $script:voxStage = 'http'
        $voxFields = @{code='http_error';ok=$false;http_status=[int]$Matches[1];bytes=[int]$Matches[2]}
    } elseif ($Line -match '^\[ERROR\] (Cannot reach server|No Wi-Fi IP|HTTP request is too long)') {
        $script:voxStage = if ($Matches[1] -eq 'No Wi-Fi IP') {'wifi'} elseif ($Matches[1] -eq 'Cannot reach server') {'tcp'} else {'http'}
        $voxFields = @{code='protocol_error';ok=$false}
    } elseif ($Line -match '^\[HTTP OK\] ([0-9]{1,5}) bytes:') {
        $script:voxStage = 'http'; $voxFields = @{code='http_ok';ok=$true;bytes=[int]$Matches[1];http_status=200}
    } elseif ($Line -match '^\[HTTP\] Sending request;') {
        $script:voxStage = 'http'; $voxFields = @{code='command'}
    } elseif ($Line -match '^\[WIFI\]') {
        $script:voxStage = 'wifi'; $voxFields = @{code='waiting'}
    } elseif ($Line -match '^\[SYNC OK\] request_ms=([0-9]{1,10})') {
        $voxFields = @{stage='sync';code='sync_ok';ok=$true;elapsed_ms=[long]$Matches[1]}
    } elseif ($Line -match '^\[SYNC FAIL\]') {
        $voxFields = @{stage='sync';code='sync_failed';ok=$false}
    } elseif ($Line -match '^\[CLOCK\] Waiting for first server sync') {
        $voxFields = @{stage='clock';code='clock_wait'}
    } elseif ($Line -match '^\[CLOCK\] HK=([0-9]{1,2}):([0-9]{2}):') {
        $voxFields = @{stage='clock';code='clock_status';hour=[int]$Matches[1];minute=[int]$Matches[2]}
    } elseif ($Line -match '^\[SCHEDULE\] HK=([0-9]{1,2}):([0-9]{2})') {
        $voxFields = @{stage='schedule';code='schedule';hour=[int]$Matches[1];minute=[int]$Matches[2]}
    } elseif ($Line -match '^\[KEY\] ([1-8])$') {
        $voxFields = @{stage='keys';code='key';key=[int]$Matches[1]}
    } elseif ($Line -match '^\[RESET/SYNC\]') {
        $voxFields = @{stage='keys';code='reset'}
    } elseif ($Line -match '^\[BUTTON\] Immediate saved briefing requested') {
        $voxFields = @{stage='keys';code='requested'}
    } elseif ($Line -match '^\[STOP\]') {
        $voxFields = @{stage='device';code='stopped'}
    } else { return } # Ignore SSIDs, passwords, response bodies and unknown lines.
    $script:voxSequence++
    $voxEvent = @{at=[DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8)).ToString('o');
                  session=$voxSession;seq=$script:voxSequence;stage=$script:voxStage}
    foreach ($voxKey in $voxFields.Keys) { $voxEvent[$voxKey] = $voxFields[$voxKey] }
    $voxWriter.WriteLine(($voxEvent | ConvertTo-Json -Compress))
    Write-Host ("{0} {1} {2}" -f $voxEvent.at,$voxEvent.stage,$voxEvent.code)
}

$voxSerial = $null
try {
    if ($ReplayPath) {
        foreach ($voxLine in [IO.File]::ReadLines([IO.Path]::GetFullPath($ReplayPath))) { Write-VoxLine $voxLine.Trim() }
    } else {
        if (!$Port) { throw 'Specify -Port COM10 (use the current Arduino port). Close Arduino Serial Monitor first.' }
        $voxSerial = [IO.Ports.SerialPort]::new($Port,115200,[IO.Ports.Parity]::None,8,[IO.Ports.StopBits]::One)
        $voxSerial.Encoding = [Text.Encoding]::UTF8
        $voxSerial.DtrEnable = $true
        $voxSerial.Open() # No firmware upload, baud change, or serial commands.
        Write-Host "Listening on $Port for $Seconds seconds; press key 8 on the physical board if needed."
        $voxWatch = [Diagnostics.Stopwatch]::StartNew(); $voxBuffer = ''
        while ($voxWatch.Elapsed.TotalSeconds -lt $Seconds) {
            $voxBuffer += $voxSerial.ReadExisting()
            while ($voxBuffer.Contains("`n")) {
                $voxSplit = $voxBuffer.IndexOf("`n")
                Write-VoxLine $voxBuffer.Substring(0,$voxSplit).Trim()
                $voxBuffer = $voxBuffer.Substring($voxSplit+1)
            }
            if ($voxBuffer.Length -gt 2048) { $voxBuffer = '' }
            Start-Sleep -Milliseconds 30
        }
    }
} finally {
    if ($voxSerial) { if ($voxSerial.IsOpen) { $voxSerial.Close() }; $voxSerial.Dispose() }
    $voxWriter.Dispose()
}
Write-Host "Saved $script:voxSequence sanitized events: $OutputPath"
