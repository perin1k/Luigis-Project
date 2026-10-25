/** Root-only deployment uses the returned text; never print it (it contains a private proxy proof). */
export function renderNginxConfig({strHostname,intPublicPort=443,intBackendPort=3443,strSecret,bLoopbackOnly=false,
  strCertificatePath,strKeyPath,strTrustedCaPath='/etc/ssl/certs/ca-certificates.crt',
  strPidPath='/run/nginx.pid',strLogPath='/var/log/nginx/luigis-access.log',strWorkerUser='www-data'}){
  if(typeof strHostname!=='string'||! /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(strHostname)
    ||! /^[a-f0-9]{64}$/.test(strSecret??'')||! /^[a-z_][a-z0-9_-]*$/.test(strWorkerUser)
    ||![intPublicPort,intBackendPort].every(intPort=>Number.isInteger(intPort)&&intPort>0&&intPort<=65535)
    ||intBackendPort<1024||intBackendPort===intPublicPort)throw new Error('Reviewed proxy identity/ports required.');
  const strJournal='syslog:server=unix:/dev/log,facility=local7,tag=luigis_proxy,severity=info';
  for(const strPath of [strCertificatePath,strKeyPath,strTrustedCaPath,strPidPath,...(strLogPath===strJournal?[]:[strLogPath])]){
    if(typeof strPath!=='string'||! /^\/[a-zA-Z0-9_./-]+$/.test(strPath)||strPath.split('/').includes('..'))throw new Error('Safe absolute deployment paths required.');
  }
  const strHost=strHostname+(intPublicPort===443?'':':'+intPublicPort);
  const strListen=(bLoopbackOnly?'127.0.0.1:':'')+intPublicPort;
  return `# Managed Luigi's reverse proxy. Private: contains the local upstream proof.
user ${strWorkerUser};
worker_processes 1;
pid ${strPidPath};
# Raw nginx error contexts can contain private URLs; use status-only access
# telemetry and systemd service health instead of request-bearing error logs.
error_log /dev/null;
events { worker_connections 512; }
http {
  server_tokens off;
  log_format luigis_safe '$time_iso8601 status=$status upstream=$upstream_status elapsed=$request_time upstream_elapsed=$upstream_response_time';
  access_log ${strLogPath} luigis_safe;
  client_max_body_size 16k;
  client_header_timeout 15s;
  client_body_timeout 15s;
  send_timeout 30s;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_tickets off;
  ssl_certificate ${strCertificatePath};
  ssl_certificate_key ${strKeyPath};
  server {
    listen ${strListen} ssl default_server;
    server_name _;
    return 444;
  }
  server {
    listen ${strListen} ssl;
    server_name ${strHostname};
    add_header Strict-Transport-Security "max-age=86400" always;
    location / {
      proxy_pass https://127.0.0.1:${intBackendPort};
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_set_header Host ${strHost};
      proxy_set_header X-Forwarded-Host ${strHost};
      proxy_set_header X-Forwarded-Proto https;
      # Replace, never append, caller-provided forwarding chains.
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Luigis-Proxy-Token ${strSecret};
      proxy_ssl_server_name on;
      proxy_ssl_name ${strHostname};
      proxy_ssl_verify on;
      proxy_ssl_verify_depth 3;
      proxy_ssl_trusted_certificate ${strTrustedCaPath};
      proxy_connect_timeout 5s;
      proxy_next_upstream off;
      proxy_read_timeout 30s;
      proxy_send_timeout 30s;
      # Keep customer/password bodies and responses out of proxy temp files/cache.
      proxy_request_buffering off;
      proxy_buffering off;
      proxy_max_temp_file_size 0;
      proxy_cache off;
      proxy_hide_header X-Luigis-Proxy-Token;
    }
  }
}
`;
}
