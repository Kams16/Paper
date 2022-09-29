// 사용자 정보가 존재하지 않는다면 로그인 페이지로 이동
if (!localStorage.getItem('name')) {
  location.href = '/login';
}

// window.onload
$(function () {
  // 푸시 지원 여부
  let pushSupport = false;
  // 사용자 구독 정보
  let userSubscription = null;

  const notificationControl = document.getElementById('notification_control');
  const notificationButton = document.getElementById('notification');
  const paperTitle = document.getElementById('paper_title');
  const paperContent = document.getElementById('paper_content');
  const paperImage = document.getElementById('paper_image');
  const submitButton = document.getElementById('paper_submit');
  const userName = localStorage.getItem('name') || '';

  // 앱 초기화
  app.init();

  // IndexedDB 준비
  const paperDB = new PaperStore();

  // 알림 버튼
  notificationButton.addEventListener('click', () => {
    // @ch10. 권한 확인 및 요청
    if(!pushSupport) {      // 사용자의 브라우저가 푸시 기능을 지원하는지 확인
      return;
    } else {
      // Notification.permission을 통해 알림 권한 확인
      // 1. default(기본) : 알림 권한을 요청하면, 사용자에게 팝업 메시지를 표시
      // 2. denied(거부) : 사용자가 거부한 상태
      // 3. granted(허가) : 사용자가 허가한 상태
      Notification.requestPermission().then(function(permission) {
        console.log('Push Permission:', permission);
        updatePushButton();       // 사용자에게 권한을 요청한 이후에도 권한을 확인하여 버튼 갱신
        
        if(Notification.permission !== 'granted') {
          return;
        } else {
          // 푸시 서비스 구독 상태에 따라 작업 분기 처리
          if(userSubscription) {
            pushUnsubscribe();      // 푸시 서비스 구독취소
          } else {
            pushSubscribe();        // 푸시 서비스 구독
          }
        }
      });
    }
  });

  // 게시물 작성 버튼
  submitButton.addEventListener('click', () => {
    // 제목과 본문이 비어있는지 확인
    if (paperTitle.value && paperContent.value) {
      const title = paperTitle.value;
      const content = paperContent.value;
      const image = paperImage.files[0];

      app.showLoading(true);
      uploadPost(title, content, image)
        .then((post) => {
          app.renderPost(post, {
            onFavorite,
            onDelete,
            prepend: true
          });

          // @ch6. IndexedDB에 게시물 데이터 저장
          paperDB.savePost(post);
        })
        .catch(() => {
          // @ch8. 게시물 업로드 작업 등록
          const jobData = {
            postId: +new Date(),
            user: userName,
            title,
            content,
            image,
            action: 'upload'
          };

          paperDB.addJob(jobData).then(() => {
            requestBackgroundSync();
            updateJobList();
          });
        })
        .finally(() => {
          app.showLoading(false);
          app.showPaper(false);
        });
    } else {
      util.message('내용을 입력해주세요');
    }
  });

  // 게시물 목록 업데이트
  function updatePostList () {
    app.clearPost();
    // 게시물 가져오기
    return axios.get('/api/posts')
      .then((response) => {
        const posts = response.data;

        // 게시물 화면에 렌더링
        app.renderPost(posts, {
          onFavorite,
          onDelete
        });

        // @ch6. IndexedDB에 게시물 데이터 저장
        paperDB.clearPost().then(() => {
          for (const post of posts) {
            paperDB.savePost(post);
          }

          // 게시물 데이터의 image 값만 추출하여 새로운 배열로 매핑
          const images = posts.map((post) => post.image);

          // action: sync-image
          // payload: images
          toServiceWorker('sync-image', images);
        });
      })
      .catch(() => {
        // @ch6. IndexedDB에 저장해둔 게시물 불러오기
        paperDB.getPosts().then((posts) => {
          app.renderPost(posts, {
            onFavorite,
            onDelete
          });
        });
      });
  }

  // 동기화 작업 목록 업데이트
  function updateJobList () {
    // @ch8. IndexedDB 작업 데이터 조회 및 화면에 표시
    return paperDB.getJobs(userName).then((jobs) => {
      app.renderJobList(jobs, onCancel);
    });
  }

  // 게시물 업로드
  function uploadPost (title, content, image) {
    const formData = new FormData();
    formData.append('user', userName);
    formData.append('title', title);
    formData.append('content', content);
    formData.append('image', image);

    return axios.post('/api/posts', formData)
      .then((response) => response.data);
  }

  // 게시물 수정 (좋아요)
  function updatePost (id, state) {
    return axios.put('/api/posts/' + id, { state })
      .then((response) => response.data);
  }

  // 게시물 삭제
  function deletePost (id) {
    return axios.delete('/api/posts/' + id)
      .then((response) => response.data);
  }

  // 좋아요 핸들러
  function onFavorite (id, state) {
    updatePost(id, state)
      .then(() => {
        // @ch6. IndexedDB 게시물 좋아요 상태 갱신
        paperDB.updatePost(id, state);
      })
      .catch(() => {
        // @ch8. 게시물 업데이트 작업 등록
        const jobData = {
          postId: id,
          user: userName,
          state,
          action: 'update'
        };

        paperDB.addJob(jobData).then(() => {
          requestBackgroundSync();
          paperDB.updatePost(id, state);
        });
      });
  }

  // 게시물 삭제 이벤트 핸들러
  function onDelete (id) {
    app.showLoading(true);
    deletePost(id)
      .then((post) => {
        app.removePost(post.id);

        // @ch6. IndexedDB에 저장되어있던 게시물 삭제
        paperDB.deletePost(post.id);
      })
      .catch(() => {
        // @ch8. 게시물 삭제 작업 등록
        const jobData = {
          postId: id,
          user: userName,
          action: 'delete'
        };

        paperDB.addJob(jobData).then(() => {
          requestBackgroundSync();
          updateJobList();
        });
      })
      .finally(() => {
        app.showLoading(false);
      });
  }

  // 동기화 작업 취소 핸들러
  function onCancel (jobId) {
    // @ch8. 작업 삭제
    paperDB.deleteJob(jobId);
  }

  // 대기 중인 작업 수행
  function doJobs () {
    // 백그라운드 동기화 기능을 지원하는 경우 함수 종료
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      return;
    }

    paperDB.getJobs(userName).then((jobs) => {
      Promise.all(jobs.map((job) => {
        const action = job.action;

        if (action === 'upload') {
          return uploadPost(job.title, job.content, job.image).then(() => {
            return paperDB.deleteJob(job.id);
          });
        } else if (action === 'delete') {
          return deletePost(job.postId).then(() => {
            return paperDB.deleteJob(job.id);
          });
        } else if (action === 'update') {
          return updatePost(job.postId, job.state).then(() => {
            return paperDB.deleteJob(job.id);
          });
        }
      })).then((results) => {
        if (results.length) {
          // 작업이 완료된 경우 게시물 목록을 다시 로드하고,
          // 대기 중인 작업 목록을 갱신합니다.
          updatePostList();
          updateJobList();
        }
      });
    });
  }

  // 백그라운드 동기화 작업 요청
  function requestBackgroundSync () {
    // @ch8. 백그라운드 동기화 작업 등록
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.sync.register('job-' + userName);
      });
    }
  }

  // 서비스 워커에게 메시지 전달
  function toServiceWorker (action, payload) {
    // @ch9. 메시지 전달을 통해 서비스 워커에게 작업 요청
    if (
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller
    ) {
      const messageData = { action, payload };

      // 새로운 메시지 채널 생성
      const channel = new MessageChannel();

      // 반대 포트(port2)에서 전달되는 메시지 수신
      channel.port1.onmessage = (event) => {
        console.log('From Service Worker: ' + event.data);
      };

      navigator
        .serviceWorker
        .controller
        .postMessage(messageData, [channel.port2]); // 2번 포트 전달
    }
  }

  // 푸시 구독
  function pushSubscribe () {   // 푸시 서비스 구독을 담당하는 함수로 구현
    // @ch10. 푸시 구독 기능 구현
    axios.get('/api/publicKey').then(function(response) {
      // Uint8Array 타입으로 변환
      const publicKey = util.urlB64ToUint8Array(response.data);

      navigator.serviceWorker.ready.then(function(registration) {
        // 구독 옵션
        const option = {
          userVisibleOnly : true,           // userVisibleOnly :: 푸시 알림을 사용자에게 보여줄지에 대한 여부
          applicationServerKey : publicKey  // applicationServerKey :: 애플리케이션 서버 키(공개키)
        };

        // 푸시 구독 서비스
        registration.pushManager        // 푸시 API를 사용하기 위해 서비스 워커 등록 객체를 가져온 후 pushManager에 접근
                    .subscribe(option)  // pushManager의 다양한 푸시 기능 메소드 중 subscribe() 메소드를 통해 푸시 서비스를 구독할 수 있음
                    .then(function(subscription) {
                      // 애플리케이션 서버로 구독 정보 전달
                      updateSubscription(subscription);
                      userSubscription = subscription;
                      console.log('Push subscribed!', subscription);
                    })
                    .catch(function(err) {
                      userSubscription = null;
                      console.err('Push subscribe failed: ', err);
                      util.message('푸시 알림을 구독할 수 없습니다.');
                    })
                    .finally(function() {
                      updatePushButton();   // 버튼 갱신
                    });
      });
    }).catch(function(err) {
      console.error(err);
    });
  }

  // 푸시 구독 취소
  function pushUnsubscribe () {
    // @ch10. 푸시 구독 취소 기능 구현
    if(!userSubscription) {
      return;
    }

    // 푸시 서비스 구독 취소
    userSubscription.unsubscribe()       // unsubscribe() :: 구독 취소, 프로미스 기반, 결과 값으로 구독 취소 여부를 resolve
                    .then(function(result) {
                      console.log('Push unsubscribed: ', result);

                      if(result) {
                        // 애플리케이션 서버에 저장된 구독 정보 지우기
                        updateSubscription(null);
                        userSubscription = null;
                      }
                    })
                    .catch(function(err) {
                      console.error('Push unsubscribe failed: ', err);
                    })
                    .finally(function() {
                      updatePushButton();   // 버튼 갱신
                    });
  }

  // 구독 정보 서버로 전달
  function updateSubscription (subscription) {
    // @ch10. 푸시 구독 정보 전송 기능 구현
    axios.post('/api/pushSubscription', { subscription })
         .catch(function(err) {
          console.error(err);
         });
  }

  // 구독 상태에 따라 버튼 스타일 변경
  function updatePushButton () {
    // @ch10. 푸시 구독 상태에 따라 버튼 갱신 기능 구현
    if(Notification.permission === 'denied') {
      // 알림 권한이 거부된 경우
      notificationButton.textContent = '알림 차단됨';
      notificationButton.classList.add('denied');
      return;
    }

    // 구독 상태인 경우
    if(userSubscription) {
      notificationButton.textContent = '알림 끄기';
      notificationButton.classList.add('granted');

    // 미구독 상태인 경우
    } else {
      notificationButton.textContent = '알림 켜기';

      // 스타일 클래스를 모두 제거: 기본 버튼
      notificationButton.classList.remove('granted');
      notificationButton.classList.remove('denied');
    }
  }

  // Paper 초기 로딩
  (function init () {
    Promise.all([
      updatePostList(),
      updateJobList(),
      doJobs()
    ]);
  })();

  // @ch9. 서비스 워커 메시지 이벤트 핸들러 구현
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data === 'job-finished') {
        updatePostList();
        updateJobList();
      }
    });

    // 푸시 기능 지원 여부에 따라 알림 구독 버튼 보이기/숨기기 처리
    navigator.serviceWorker.ready.then(function(registration) {
      if(registration.pushManager) {
        pushSupport = true;
        notificationControl.classList.remove('disabled');

        // 구독 정보 불러오기
        registration.pushManager
                    .getSubscription()      // 해당 사용자 에이전트(브라우저)의 구독 정보를 가져옴
                    .then(function(subscription) {
                      // 구독 정보 가져온 후 userSubscription 변수에 저장
                      userSubscription = subscription;
                    })
                    .finally(function() {
                      updatePushButton();   // 웹 페이지가 로드되었을 때 권한 상태에 따라 버튼 갱신
                    });
      }
    })
  }
});
