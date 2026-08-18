# ESP32-CAM 영상 수집기

AI Thinker ESP32-CAM에서 JPEG 사진과 MJPEG 영상을 로컬 Wi-Fi로 제공하는 수집 펌웨어다. 사람 탐지나 위험 판단은 ESP32-CAM에서 하지 않고 노트북의 동선 처리 계층이 담당한다.

## 준비

1. VS Code에 PlatformIO를 설치한다.
2. `include/config.example.h`를 `include/config.h`로 복사한다.
3. `RISK_ZERO_WIFI_SSID`, `RISK_ZERO_WIFI_PASSWORD`, `RISK_ZERO_DEVICE_ID`를 수정한다.
4. AI Thinker ESP32-CAM을 연결하고 `Upload`를 실행한다.
5. 시리얼 모니터를 115200 baud로 열어 할당된 IP를 확인한다.

`config.h`는 Git에서 제외된다. 실제 Wi-Fi 비밀번호를 `config.example.h`에 적지 않는다.

## 제공 주소

- `http://장치IP/health`: 장치 ID, Wi-Fi 신호, 여유 메모리 확인
- `http://장치IP/capture`: 현재 JPEG 한 장
- `http://장치IP:81/stream`: 로컬 처리기에 전달할 MJPEG 스트림

기본 해상도는 QVGA(320×240), JPEG 품질 값은 12다. 동선 실험에서는 높은 해상도보다 끊김 없이 시간 순서가 유지되는 것이 우선이다.

## 전원 주의

업로드와 실행에는 안정적인 5V 전원을 사용한다. 카메라와 Wi-Fi가 동시에 동작할 때 전원이 부족하면 재부팅이나 프레임 손실이 발생할 수 있다. 현관 밖 인터넷에 스트림을 공개하지 말고 같은 실험용 로컬 네트워크에서만 사용한다.

