# Migration script for Tratativas project

# Create necessary directories if they don't exist
$directories = @(
    "views",
    "public/css",
    "public/images",
    "routes",
    "services",
    "config",
    "middleware",
    "scripts"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir
        Write-Host "Created directory: $dir"
    }
}

# File movements
$fileMoves = @{
    "views/templateTratativa.handlebars" = "views/templateTratativa.handlebars"
    "public/tratativa-preview.html" = "public/tratativa-preview.html"
    "public/tratativa-styles.css" = "public/css/tratativa-styles.css"
    "public/images/logoib.png" = "public/images/logoib.png"
    "routes/tratativa.routes.js" = "routes/tratativa.routes.js"
    "services/tratativa.service.js" = "services/tratativa.service.js"
    "config/supabase-tratativas.js" = "config/supabase-tratativas.js"
}

foreach ($source in $fileMoves.Keys) {
    $destination = $fileMoves[$source]
    if (Test-Path $source) {
        Copy-Item -Path $source -Destination $destination -Force
        Write-Host "Moved: $source -> $destination"
    } else {
        Write-Host "Warning: Source file not found: $source"
    }
}

Write-Host "Migration completed!" 