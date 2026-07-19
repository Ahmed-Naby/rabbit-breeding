param (
    [string]$sourcePath = "C:\Users\Ahmed\.gemini\antigravity-ide\brain\fce9fcf8-e46d-4244-a935-a37a42532c58\rabbit_app_icon_1784493750751.png"
)

# Load System.Drawing for high-quality image resizing
Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$srcPath,
        [string]$destPath,
        [int]$width,
        [int]$height,
        [bool]$saveAsIco = $false,
        [bool]$makeSilhouette = $false
    )

    $srcImg = [System.Drawing.Image]::FromFile($srcPath)
    
    # Create the resized canvas
    $destBitmap = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($destBitmap)
    
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # If we are making the adaptive foreground silhouette:
    # Scale down the rabbit head to sit inside the safe zone (center 60% of the canvas)
    if ($makeSilhouette) {
        $safeWidth = [int]($width * 0.60)
        $safeHeight = [int]($height * 0.60)
        $offsetX = [int](($width - $safeWidth) / 2)
        $offsetY = [int](($height - $safeHeight) / 2)
        $g.DrawImage($srcImg, $offsetX, $offsetY, $safeWidth, $safeHeight)
    } else {
        $g.DrawImage($srcImg, 0, 0, $width, $height)
    }
    $g.Dispose()

    # If it is a silhouette, extract the white pixels and make everything else transparent
    if ($makeSilhouette) {
        $silhouetteBitmap = New-Object System.Drawing.Bitmap($width, $height)
        for ($x = 0; $x -lt $width; $x++) {
            for ($y = 0; $y -lt $height; $y++) {
                $pixel = $destBitmap.GetPixel($x, $y)
                # If pixel is light/white (the rabbit silhouette), keep it white. Otherwise make it transparent.
                if ($pixel.R -gt 210 -and $pixel.G -gt 210 -and $pixel.B -gt 210) {
                    $silhouetteBitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, 255, 255, 255))
                } else {
                    $silhouetteBitmap.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
                }
            }
        }
        $destBitmap.Dispose()
        $destBitmap = $silhouetteBitmap
    }

    # Ensure parent directory exists
    $parentDir = Split-Path -Parent $destPath
    if (-not (Test-Path -Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    if ($saveAsIco) {
        if (Test-Path -Path $destPath) { Remove-Item -Path $destPath -Force }
        $hIcon = $destBitmap.GetHicon()
        $icon = [System.Drawing.Icon]::FromHandle($hIcon)
        $fs = [System.IO.File]::Create($destPath)
        $icon.Save($fs)
        $fs.Close()
        $icon.Dispose()
    } else {
        if (Test-Path -Path $destPath) { Remove-Item -Path $destPath -Force }
        $destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    $destBitmap.Dispose()
    $srcImg.Dispose()
    Write-Host "Generated: $destPath ($($width)x$($height))"
}

Write-Host "Starting Asset Generation..."

# 1. Electron Desktop Windows Icon (256x256 png + ico)
Resize-Image -srcPath $sourcePath -destPath "C:\Users\Ahmed\Desktop\Rabbit Breeding\electron\icon.png" -width 256 -height 256
Resize-Image -srcPath $sourcePath -destPath "C:\Users\Ahmed\Desktop\Rabbit Breeding\electron\icon.ico" -width 256 -height 256 -saveAsIco $true

# 2. Next.js Website Favicon (32x32 ico)
Resize-Image -srcPath $sourcePath -destPath "C:\Users\Ahmed\Desktop\Rabbit Breeding\src\app\favicon.ico" -width 32 -height 32 -saveAsIco $true

# 3. PWA Icons (Mobile browser, offline app)
Resize-Image -srcPath $sourcePath -destPath "C:\Users\Ahmed\Desktop\Rabbit Breeding\src\mobile\public\icons\icon-192.png" -width 192 -height 192
Resize-Image -srcPath $sourcePath -destPath "C:\Users\Ahmed\Desktop\Rabbit Breeding\src\mobile\public\icons\icon-512.png" -width 512 -height 512
Resize-Image -srcPath $sourcePath -destPath "C:\Users\Ahmed\Desktop\Rabbit Breeding\src\mobile\public\icons\icon-maskable-512.png" -width 512 -height 512

# 4. Android Launcher Icons (Capacitor App)
$androidRes = "C:\Users\Ahmed\Desktop\Rabbit Breeding\android\app\src\main\res"

# mipmap-mdpi (48x48)
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-mdpi\ic_launcher.png" -width 48 -height 48
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-mdpi\ic_launcher_round.png" -width 48 -height 48
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-mdpi\ic_launcher_foreground.png" -width 48 -height 48 -makeSilhouette $true

# mipmap-hdpi (72x72)
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-hdpi\ic_launcher.png" -width 72 -height 72
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-hdpi\ic_launcher_round.png" -width 72 -height 72
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-hdpi\ic_launcher_foreground.png" -width 72 -height 72 -makeSilhouette $true

# mipmap-xhdpi (96x96)
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xhdpi\ic_launcher.png" -width 96 -height 96
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xhdpi\ic_launcher_round.png" -width 96 -height 96
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xhdpi\ic_launcher_foreground.png" -width 96 -height 96 -makeSilhouette $true

# mipmap-xxhdpi (144x144)
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xxhdpi\ic_launcher.png" -width 144 -height 144
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xxhdpi\ic_launcher_round.png" -width 144 -height 144
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xxhdpi\ic_launcher_foreground.png" -width 144 -height 144 -makeSilhouette $true

# mipmap-xxxhdpi (192x192)
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xxxhdpi\ic_launcher.png" -width 192 -height 192
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xxxhdpi\ic_launcher_round.png" -width 192 -height 192
Resize-Image -srcPath $sourcePath -destPath "$androidRes\mipmap-xxxhdpi\ic_launcher_foreground.png" -width 192 -height 192 -makeSilhouette $true

# 5. Set matching background color for Adaptive launcher icon
$backgroundXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#1e1b4b</color>
</resources>
"@
Set-Content -Path "$androidRes\values\ic_launcher_background.xml" -Value $backgroundXml -Force

Write-Host "All assets generated successfully!"
