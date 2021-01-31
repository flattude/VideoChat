/*
  webrtc_signal_server.js by Rob Manson
  The MIT License
  Copyright (c) 2010-2013 Rob Manson, http://buildAR.com. All rights reserved.
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
// 라이브러리 초기화
var http = require("http"); // 웹서버 모듈
var fs = require("fs");     // 파일 모듈
var websocket = require("websocket").server;  // 웹소켓모듈

// 공통변수
var port = 80;
var webrtc_clients = [];      // 웹 소켓 브라우저 목록 저장
var webrtc_discussions = {};  //

// 웹서버 설정
// 웹서버는 별도로 존재하기 때문에 web에 대해서는 404를 response 해준다
var http_server = http.createServer(function(request, response) {
  //response.write(page);
  //response.end();
  response.writeHead(404);
  response.end();
});

// http server 서버를 선택한 포트에 바인딩
http_server.listen(port, function() {
  log_comment("server listening (port "+port+")");
});

// 웹소켓 처리
var websocket_server = new websocket({
  httpServer: http_server
});

// 새로운 요청을 처리하는 메인 함수
websocket_server.on("request", function(request) {
  log_comment("new request ("+request.origin+")");

  // 요청 허가
  var connection = request.accept(null, request.origin);
  log_comment("new connection ("+connection.remoteAddress+")");

  // 서버에 연결된 브라우저 목록 추가
  webrtc_clients.push(connection);
  connection.id = webrtc_clients.length-1;

  // 연결이 되었을때 처리
  connection.on("message", function(message) {
    // utf8만 처리
    if (message.type === "utf8") {
      log_comment("got message "+message.utf8Data);
      // 들어온 JSON 메시지를 파싱
      var signal = undefined;
      try { signal = JSON.parse(message.utf8Data); } catch(e) { };
      if (signal) {
        log_comment("token : " + signal.token);
        // 메시지 타입이 join 일경우 && token 이 있을겨웅
        if (signal.type === "join" && signal.token !== undefined) {
          try {
            // 신규 토큰일경우
            if (webrtc_discussions[signal.token] === undefined) {
              // discussion을 만들어준다
              webrtc_discussions[signal.token] = {};
            }
          } catch(e) { };
          try {
            // 생성된 방에(token) 연결된 아이디를 활성화 상태로 저장한다
            webrtc_discussions[signal.token][connection.id] = true;
          } catch(e) { };
        }
        // 메시지 타입이 join이 아닌데token이 있을경우
        // 다른 참가자들에게 전송한다
        else if (signal.token !== undefined) {
          try {
            Object.keys(webrtc_discussions[signal.token]).forEach(function(id) {
              // 자기 자신에게는 전송하지 않음
              if (id != connection.id) {
                log_comment("send id : " + id );
                webrtc_clients[id].send(message.utf8Data, log_error);
              }
            });
          } catch(e) { };
        }
        // 이외의 경우는 처리하지 않는다
        else {
          log_comment("invalid signal: "+message.utf8Data);
        }
      }
      // utf8 이외의 경우는 처리하지 않는다
      else {
        log_comment("invalid signal: "+message.utf8Data);
      }
    }
  });

  // 연결이 종료될 경우 처리
  connection.on("close", function(connection) {
    log_comment("connection closed ("+connection.remoteAddress+")");
    Object.keys(webrtc_discussions).forEach(function(token) {
      Object.keys(webrtc_discussions[token]).forEach(function(id) {
        if (id === connection.id) {
          delete webrtc_discussions[token][id];
        }
      });
    });
  });
});

// utility functions
// 에러 로그 남기기
function log_error(error) {
  if (error !== "Connection closed" && error !== undefined) {
    log_comment("ERROR: "+error);
  }
}
// 로그 남기기
function log_comment(comment) {
  console.log((new Date())+" "+comment);
}
