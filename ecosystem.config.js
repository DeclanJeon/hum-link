export default {
    apps: [{
      name: 'ponslink',
      script: 'serve',
      args: '-s build -l 8080',  // build 폴더를 3000번 포트로 서빙
      env: {
        PM2_SERVE_PATH: './build',
        PM2_SERVE_PORT: 8080,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
      },
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    }]
  };