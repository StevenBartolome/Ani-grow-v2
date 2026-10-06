Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\assets\branding\anigrow_icon.png"
$fgPath = Join-Path $PSScriptRoot "..\assets\branding\anigrow_adaptive_foreground.png"
$appIconPath = Join-Path $PSScriptRoot "..\assets\branding\anigrow_app_icon.png"
$imgFgPath = Join-Path $PSScriptRoot "..\assets\images\android-icon-foreground.png"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source icon not found at $srcPath"
    exit 1
}

$srcImage = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Loaded source image: $($srcImage.Width) x $($srcImage.Height)"

# 1. Create Adaptive Icon Foreground: 1080x1080 canvas, 540x540 circle centered (~50% scale for clean padding like Google apps)
$canvasSize = 1080
$targetSize = 540  # 540/1080 = 50% - matches Play Store, Gmail, Photos, YouTube padding
$offset = [int](($canvasSize - $targetSize) / 2)

$bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$destRect = New-Object System.Drawing.Rectangle($offset, $offset, $targetSize, $targetSize)
$graphics.DrawImage($srcImage, $destRect)
$graphics.Dispose()

$bmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($imgFgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Created adaptive foreground at $fgPath and $imgFgPath (Canvas: 1080x1080, Logo: ${targetSize}x${targetSize})"

# 2. Create Standard App Icon: 1024x1024 full emblem
$stdSize = 1024
$bmpStd = New-Object System.Drawing.Bitmap($stdSize, $stdSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphicsStd = [System.Drawing.Graphics]::FromImage($bmpStd)
$graphicsStd.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphicsStd.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphicsStd.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphicsStd.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphicsStd.Clear([System.Drawing.Color]::Transparent)

$destRectStd = New-Object System.Drawing.Rectangle(0, 0, $stdSize, $stdSize)
$graphicsStd.DrawImage($srcImage, $destRectStd)
$graphicsStd.Dispose()

$bmpStd.Save($appIconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmpStd.Dispose()
Write-Host "Created standard app icon at $appIconPath (1024x1024)"

$srcImage.Dispose()
Write-Host "Done!"
