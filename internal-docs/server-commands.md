# Server Management Commands

Server: `deploy@89.167.97.212` (adorable.run)

## Quick Access

```bash
ssh deploy@89.167.97.212
```

## Deploy

```bash
# Full deploy (build + sync + restart)
bash deploy.sh

# Or step by step:
npx nx build server --configuration=production
npx nx build client --configuration=production
npx nx build admin --configuration=production

rsync -avz --delete dist/ deploy@89.167.97.212:/opt/adorable/dist/
rsync -avz prisma/ deploy@89.167.97.212:/opt/adorable/prisma/
rsync -avz package.json package-lock.json deploy@89.167.97.212:/opt/adorable/

ssh deploy@89.167.97.212 "cd /opt/adorable && npm install --production && npx prisma generate && npx prisma migrate deploy && sudo systemctl restart adorable"
```

## Service Management

```bash
# Status / start / stop / restart
ssh deploy@89.167.97.212 "sudo systemctl status adorable"
ssh deploy@89.167.97.212 "sudo systemctl restart adorable"
ssh deploy@89.167.97.212 "sudo systemctl stop adorable"

# View logs (last 100 lines)
ssh deploy@89.167.97.212 "sudo journalctl -u adorable --no-pager -n 100"

# Follow logs live
ssh deploy@89.167.97.212 "sudo journalctl -u adorable -f"
```

## Nginx

```bash
# View config
ssh deploy@89.167.97.212 "cat /etc/nginx/sites-available/adorable"

# Test + reload after editing
ssh deploy@89.167.97.212 "sudo nginx -t && sudo systemctl reload nginx"

# View Nginx error logs
ssh deploy@89.167.97.212 "sudo tail -50 /var/log/nginx/error.log"
```

## Docker (User Containers)

```bash
# List running containers
ssh deploy@89.167.97.212 "docker ps"

# Stop all user containers
ssh deploy@89.167.97.212 "docker ps -q --filter name=adorable-user | xargs -r docker rm -f"

# Check Docker disk usage
ssh deploy@89.167.97.212 "docker system df"

# Clean up unused images/containers
ssh deploy@89.167.97.212 "docker system prune -f"
```

## Database

```bash
# Open Prisma Studio (GUI)
ssh -L 5555:localhost:5555 deploy@89.167.97.212 "cd /opt/adorable && npx prisma studio"
# Then open http://localhost:5555 in your browser

# Run a quick SQL query
ssh deploy@89.167.97.212 "cd /opt/adorable && sqlite3 prisma/dev.db 'SELECT id, email, role FROM User;'"

# Run migrations after schema changes
ssh deploy@89.167.97.212 "cd /opt/adorable && npx prisma migrate deploy"
```

## Environment

```bash
# View/edit .env
ssh deploy@89.167.97.212 "cat /opt/adorable/.env"
ssh deploy@89.167.97.212 "nano /opt/adorable/.env"
# Remember to restart after changes: sudo systemctl restart adorable
```

## Storage & Disk

```bash
# Check disk usage
ssh deploy@89.167.97.212 "df -h /"

# Check storage directory size
ssh deploy@89.167.97.212 "du -sh /opt/adorable/storage/*"

# Check project count
ssh deploy@89.167.97.212 "ls /opt/adorable/storage/projects/ | wc -l"
```

## SSL Certificate

```bash
# Check certificate expiry
ssh deploy@89.167.97.212 "sudo certbot certificates"

# Renew (auto-renew is set up, but manual if needed)
ssh deploy@89.167.97.212 "sudo certbot renew"
```

## Troubleshooting

```bash
# Server won't start — check logs
ssh deploy@89.167.97.212 "sudo journalctl -u adorable --no-pager -n 50"

# Port already in use
ssh deploy@89.167.97.212 "sudo lsof -i :3333"

# Check if server is responding
ssh deploy@89.167.97.212 "curl -s http://localhost:3333/api/auth/config | head -1"

# Check Nginx is proxying correctly
curl -s -o /dev/null -w '%{http_code}' https://adorable.run/api/auth/config
```
