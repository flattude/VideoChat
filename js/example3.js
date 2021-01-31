///////////////////////////////////////////////////////////////////////////
// 공통변수 생성
let stun_server = "stun.l.google.com:19302";  // P2P 연결을 위한 stun 객체
let call_token = "#1";
let token = "1";
// 연결객체
let localStream;
let pc;
let signaling_server;

// UI 객체를 받아온다
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const hangupButton = document.getElementById("hangupButton");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// 생성자인지 참가자인지 확인한다
let isCaller = false;
let name = "";
if (document.location.hash === "" || document.location.hash === undefined)
{
  isCaller = true;
  name = "Caller";
}
else
{
  call_token = document.location.hash;
  //video.setAttribute("src", "");
  name = "Callee";
}
////////////////////////////////////////////////////////////////////////////

// UI 객체를 초기화한다
// 초기상태에는 startButton만 활성화 되어 있어야 된다
// Caller일경우
if(isCaller)
{
  startButton.disabled = false;
  callButton.disabled = true;
  hangupButton.disabled = true;
}
// Callee일경우
else
{
  startButton.disabled = false;
  callButton.disabled = true;
  hangupButton.disabled = true;
}

// 버튼 이벤트 핸들러
startButton.addEventListener('click', startButtonClick);
callButton.addEventListener('click', callButtonClick);
hangupButton.addEventListener('click', hangupButtonClick);

let startTime;

// 비디오 이벤트 핸들러를 추가한다
// local video에 대한 콜백
// metadata가 로드될때 비디오의 정보를 출력한다
localVideo.addEventListener('loadedmetadata', function(){
    console.log(`로컬 비디오 정보 : ( ${this.videoWidth}px , ${this.videoHeight}px`);
});

// remote video에대한 콜백
// metadata가 로드될때 비디오의 정보를 출력한다
remoteVideo.addEventListener('loadedmetadata', function(){
    console.log(`리모트 비디오 정보 : ( ${this.videoWidth}px , ${this.videoHeight}px`);
});

remoteVideo.addEventListener('resize', ()=>{
  // 비디오가 시작된것을 resize callback을 통해 알 수 있다
    if( startTime )
    {
      const elapsedTime = window.performance.now() - startTime;
      console.log("시작시간 : " + elapsedTime.toFixed(3) + "ms");
      startTime = null;
    }
});

// 미디어 옵션
const offerOptions = {
  offerToReceiveAudio: 1, // 오디오 허용
  offerToReceiveVideo: 1  // 비디오 허용
};

/*
* 버튼 이벤트
*/
// 시작 버튼에 대한 이벤트 지정
// 로컬 비디오 스트림을 연다
async function startButtonClick(){
  console.log("로컬 비디오 스트림을 요청한다");
  startButton.disabled = true;  // 시작 버튼을 비활성화 한다
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    console.log("로컬 비디오 스트림을 받는다");
    localVideo.srcObject = stream;  // 로컬 비디오의 오브젝트 소스를 지정한다
    localStream = stream;           // 스트림 객체를 저장한다
    callButton.disabled = false;    // 비디오 소스를 받았으니 연결버튼을 활성화한다
  } catch(e) {
    // 에러가 나면 에러 내용을 보여준다
    alert(`비디오 연결에 실패했습니다 : ${e.name}`);
  }
}

// 호출Call 버튼에 대한 이벤트 지정
async function callButtonClick(){
  connect();

  // 콜 버튼을 비활성화, 연결끊기 버튼을 활성화
  callButton.disabled = true;
  hangupButton.disabled = false;
  // 연결을 시작합니다
  console.log("연결을 시작합니다.");
  startTime = window.performance.now();
  const videoTracks = localStream.getVideoTracks();
  const audioTracks = localStream.getAudioTracks();

  if( videoTracks.length > 0 )
  {
      console.log(`비디오 연결에 사용되는 장비 : ${videoTracks[0].label}`);
  }
  if( audioTracks.length > 0 )
  {
      console.log(`오디오 연결에 사용되는 장비 : ${audioTracks[0].label}`);
  }

  // SDP 정보를 가져온다
  const configuration = getSelectedSdpSemantics();
  console.log("RTCPeerConnection 설정 : ", configuration);
  configuration["iceServers"] = [{ "url": "stun:"+stun_server },];

  // Caller 연결 생성
  pc = new RTCPeerConnection(configuration);
  pc.addEventListener('icecandidate', e => onIceCandidate(pc, e));
  pc.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc, e));
  pc.addEventListener('track', gotRemoteStream);  // 2020-05-07

  // 전송할 track을 설정한다
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  console.log("로컬 스트림을 트랙에 추가한다");
}

// 연결취소 버튼
function hangupButtonClick() {
  console.log('종료클릭');
  if( isCaller )
  {
    pc.close();
    pc = null;
    hangupButton.disabled = true;
    callButton.disabled = false;
  }
  else
  {
    pc.close();
    pc = null;
    hangupButton.disabled = true;
    callButton.disabled = false;
  }
}
//////////////////////////////////////////////////////////////////////////////
// 핸들러
//////////////////////////////////////////////////////////////////////////////
// Description 생성에 에러가 날경우 처리
function onCreateSessionDescriptionError(error) {
  console.log(`세션 정보 생성에 실패했습니다 : ${error.toString()}`);
}
function onSetLocalSuccess(pc){
  console.log(`${name} 로컬 Description 생성 성공`);
}
function onSetRemoteSuccess(pc){
  console.log(`${name} 리모트 Description 생성 성공`);
}

// Description이 성공적으로 생성되면 상대편으로 Description을 보내준다
async function onCreateOfferSuccess(desc){
  console.log("onCreateOfferSuccess");
  pc.setLocalDescription(
    desc,
    function () {
      signaling_server.send(
        JSON.stringify({
          token:call_token,
          type:"new_description",
          sdp:desc
        })
      );
    },
    log_error
  );
}

// Description이 성공적으로 생성되면 상대편으로 Description을 보내준다
async function onCreateAnswerSuccess(desc){
  console.log("onCreateAnswerSuccess");
  pc.setLocalDescription(
    desc,
    function () {
      signaling_server.send(
        JSON.stringify({
          token:call_token,
          type:"new_description",
          sdp:desc
        })
      );
    },
    log_error
  );
}


// onIceCandidate 이벤트 핸들러
async function onIceCandidate(pc, event) {
  console.log("onIceCandidate");
  if (event.candidate) {
    signaling_server.send(
      JSON.stringify({
        token: call_token,
        type: "new_ice_candidate",
        candidate: event.candidate ,
      })
    );
  }
}

// IceCandidate가 성공했을경우
function onAddIceCandidateSuccess(pc) {
  console.log(`${name} ICE 후보 생성에 성공`);
}

// IceCandidate가 실패했을경우
function onAddIceCandidateError(pc, error) {
  console.log(`${name} ICE 후보 생성에 실패: ${error.toString()}`);
}

// 원격 스트림을 받는 핸들러
function gotRemoteStream(e) {
  // 원격으로 들어온 스트림이 현재 스트림과 다를경우 변경
  if (remoteVideo.srcObject !== e.streams[0]) {
    // 스트림 변경처리
    remoteVideo.srcObject = e.streams[0];
    console.log("Callee는 리모트 스트림을 받았다");
  }
}

// 상태 변경시 이벤트
function onIceStateChange(pc, event) {
  if (pc) {
    console.log(`${name} ICE 상태 : ${pc.iceConnectionState}`);
    console.log('ICE 상태 변경 이벤트 : ', event);
  }
}

// SDP Semantics 옵션
function getSelectedSdpSemantics(){
  const sdpSemanticsSelect = document.querySelector('#sdpSemantics');
  const option = sdpSemanticsSelect.options[sdpSemanticsSelect.selectedIndex];
  return option.value === '' ? {} : {sdpSemantics: option.value};
}

///////////////////////////////////////////////////////////////////////////////
// 시그널링 서버연결
///////////////////////////////////////////////////////////////////////////////
function connect()
{
  signaling_server = new WebSocket("http://35.225.59.214:3000");
  if(isCaller)
  {
    call_token = "#" + token;
    document.location.hash = token;

    // 웹소켓이 연결되면 발생하는 이벤트
    signaling_server.onopen = function() {
      // 메시지가 들어올 경우 처리할 핸들러를 지정한다
      // setup caller signal handler
      signaling_server.onmessage = caller_signal_handler;

      // join 메시지를 전송한다
      // tell the signaling server you have joined the call
      signaling_server.send(
        JSON.stringify({
          token:call_token,
          type:"join",
        })
      );
    }
    document.title = "Caller 입니다";
  }
  else
  {
    log_error("call_token : " + document.location.hash);
    // get the unique token for this call from location.hash
    call_token = document.location.hash;

    // Signaling 서버가 열리r면 발생할 동작
    signaling_server.onopen = function() {
      // 메시지 핸들러를 설정한다
      // setup caller signal handler
      signaling_server.onmessage = callee_signal_handler;

      // Join했다는 것을 알린다
      // tell the signaling server you have joined the call
      signaling_server.send(
       JSON.stringify({
         token:call_token,
         type:"join",
         })
       );

       // 접속했다는 것을 알리고, 통화를 시작할 수 있다는 것을 알린다
       // let the caller know you have arrived so they can start the call
       signaling_server.send(
        JSON.stringify({
          token:call_token,
          type:"callee_arrived",
        })
       );
       document.title = "Callee 입니다";
    }
  }
}

// 콜러의 시그널 처리
async function caller_signal_handler(event)
{
  var signal = JSON.parse(event.data);
  if (signal.type === "callee_arrived") {
    try{
      console.log("Offer를 생성한다");
      const offer = await pc.createOffer(offerOptions);
      await onCreateOfferSuccess(offer);
    } catch(e){
      onCreateSessionDescriptionError(e);
    }
  }
  // caller의 ICE 연결에 대한 핸들러
  else if (signal.type === "new_ice_candidate") {
    log_error("recv : new_ice_candidate");
    pc.addIceCandidate(
      new RTCIceCandidate(signal.candidate)
    );
  }
  // caller의 Description 생성에 대한 핸들러
  else if (signal.type === "new_description") {
    log_error("recv : new_description");
    // 원격 전송에 대한 Description을 설정한다
    await pc.setRemoteDescription(signal.sdp);
    // 추가로 핸들링 하고자 하는 내용을 여기다 적는다

    /*
    // Depricated 된 코드
    // https://developer.mozilla.org/ko/docs/Web/API/RTCPeerConnection/setRemoteDescription 참조
    pc.setRemoteDescription(
      new RTCSessionDescription(signal.sdp),
      function () {
        if (pc.remoteDescription.type == "answer") {
          // extend with your own custom answer handling here
        }
      },
      log_error
    );
    */
  } else {
    // extend with your own signal types here
  }
}
// 콜리의 시그널 처리
async function callee_signal_handler(event)
{
  // 데이터를 JSON Object로 변환
  var signal = JSON.parse(event.data);
  // 타입이 new_ice_candidate일 경우 peer연결시도
  if (signal.type === "new_ice_candidate") {
    log_error("recv : new_ice_candidate");
    pc.addIceCandidate(
      new RTCIceCandidate(signal.candidate)
    );
  }
  // 타입이 new_description일 경우 원격 연결에 대한 description 설정
  else if (signal.type === "new_description") {
    log_error("recv : new_description");

    // 최근코드
    await pc.setRemoteDescription(signal.sdp);
    if (pc.remoteDescription.type == "offer") {
          const answer = await pc.createAnswer();
          await onCreateAnswerSuccess(answer);
    }
    /*
    // depricated 된 코드
    // https://developer.mozilla.org/ko/docs/Web/API/RTCPeerConnection/setRemoteDescription 참조
    pc.setRemoteDescription(
      new RTCSessionDescription(signal.sdp),
      async function () {
        if (pc.remoteDescription.type == "offer") {
          //pc.createAnswer(onCreateAnswerSuccess, log_error);
          const answer = await pc.createAnswer();
          await onCreateAnswerSuccess(answer);
        }
      },
      log_error
    );
    */
  } else {
    // extend with your own signal types here
  }
}

///////////////////////////////////////////////////

function log_error(error)
{
  console.log(error);
}
