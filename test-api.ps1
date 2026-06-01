try {
    $body = Get-Content payload-invalid1.json -Raw
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/inscricoes/create' -Method Post -Body $body -ContentType 'application/json'
    Write-Host "Status Code:" $response.StatusCode
    Write-Host "Content:" $response.Content
} catch {
    Write-Host "Status Code:" $_.Exception.Response.StatusCode
    Write-Host "Content:" $_.Exception.Response.Content
}