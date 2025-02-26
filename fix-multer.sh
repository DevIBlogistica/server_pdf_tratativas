#!/bin/bash

# Backup do arquivo original
cp /home/ubuntu/server_pdf_tratativas/routes/tratativa.routes.js /home/ubuntu/server_pdf_tratativas/routes/tratativa.routes.js.bak

# Remove a linha que contém multer
sed -i '/multer/d' /home/ubuntu/server_pdf_tratativas/routes/tratativa.routes.js

# Reinicia o servidor
pm2 restart server_tratativas 