const config = require('config');       // 프로젝트 폴더의 config/default.json 파일에 존재하는 VAPID 관련 설정 값 + gcmKey 값을 불러옴
const webpush = require('web-push');

// config에서 키 값 가져오기
const gcmKey = config.get('gcmKey');
const subject = config.get('subject');
const vapidPublic = config.get('vapidPublic');
const vapidPrivate = config.get('vapidPrivate');

// @ch10. 푸시 설정 :: web-push 라이브러리의 setGCMAPIKey()와 setVapidDetails() 메소드를 통해 푸시 서비스로 메시지를 전달하기 위한 기본 설정 진행
webpush.setGCMAPIKey(gcmKey);                   // VAPID를 지원하지 않는 브라우저에게 푸시 메시지를 전달하기 위한 GCM키 값을 설정
webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);    // VAPID를 지원하는 경우 setVapidDetails()에서 설정한 값을 기준으로 데이터를 서명하여 푸시 서버로 전달

/**
 * 푸시 알림을 전송합니다.
 * @param {any} subscription 구독 정보 객체
 * @param {any} data 푸시 알림으로 전달할 데이터 객체
 */
function sendNotification (subscription, data) {
    // @ch10. 푸시 메시지 전달
    // :: 푸시 메시지는 web-push 라이브러리의 sendNotification() 메소드를 통해 전송 가능
    // sendNotification() :: 메시지를 받게 될 사용자 에이전트(브라우저)의 구독 정보를 받으며, 전달하고자 하는 문자열 형태의 푸시 메시지 데이터를 받음
    //                       프로미스 기반으로 동작하며, 푸시 서비스의 응답 정보를 반환(응답정보에는 HTTP 상태 코드가 포함)
    return webpush.sendNotification(subscription, JSON.stringify(data));
}

// 해당 push.js 파일을 모듈로 불러와 sendNotification() 함수와 VAPID 공개키를 다른 곳에서도 사용할 수 있도록 구현
exports.publicKey = vapidPublic;
exports.sendNotification = sendNotification;
