# MicroBlaze 애플리케이션 연결

이 폴더는 Vitis에서 생성한 Arty A7-100T MicroBlaze standalone/lwIP 프로젝트에 넣는 소스다. `main.c`는 고정 IP, AXI Ethernet Lite, lwIP raw API를 초기화하고 `risk_zero_app_init()`을 호출한다. Vitis가 생성한 `platform.c`, `platform.h`와 linker script는 프로젝트에 유지한다.

필요한 BSP 구성은 다음과 같다.

- 프로세서: MicroBlaze
- 네트워크: AXI Ethernet Lite + lwIP raw API
- 메모리: MIG 7 Series DDR3
- 사용자 IP: `risk_zero_motion_axi_lite_0`
- 애플리케이션 heap은 64KB 이상
- `printf`의 float 지원은 필요하지 않음

`risk_zero_config.h`의 `RISK_ZERO_MOTION_BASEADDR`가 생성된 `xparameters.h` 이름과 다르면 그 한 줄만 맞춘다. 기본 장치 IP는 Vitis lwIP 템플릿에서 같은 공유기 대역의 고정 IP로 지정한다. 예를 들어 ESP32-CAM이 `192.168.0.30`이면 Arty를 `192.168.0.40`으로 둔다.

동작 포트:

- UDP `5005`: ESP32-CAM의 RZFP 프레임 수신
- HTTP `80`: `GET /trajectory`에 해당하는 현재 상태 JSON 응답

현재 HTTP 구현은 경로를 구분하지 않고 모든 GET에 같은 상태를 반환하는 캡스톤용 최소 서버다. 인터넷에 직접 공개하지 않는다.
