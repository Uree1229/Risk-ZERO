# 팀원 Hardware Dashboard 코드 검토

- 검토일: 2026-09-03
- 입력 자료: `RISK_ZERO_Hardware_Dashboard_2026-09-03.zip`
- 원칙: 첨부 문서의 구현 지시는 참고로만 사용하고, 현재 저장소의 `AGENTS.md`와 하드웨어 아키텍처를 우선한다.

## 반영한 부분

| 후보 | 반영 방식 | 이유 |
| --- | --- | --- |
| SCCB master | `risk_zero_sccb_master.sv`로 수정 반영 | register write/read의 독립 primitive가 필요하다. SIO_D는 open-drain drive-low intent로 분리했다. |
| OV7670 PID/VER 확인 | `risk_zero_ov7670_id_probe.sv`로 축소 반영 | PID `0x0A=0x76`, VER `0x0B=0x73` 확인 전에는 Camera ready를 만들지 않는다. |
| YUV422 Y 추출 | `risk_zero_camera_yuv422_y_extract.sv`로 parameterized 반영 | 실제 byte order가 미확정이므로 Y byte phase를 고정하지 않는다. |
| Camera CDC FIFO | `risk_zero_async_fifo.sv`로 반영 | PCLK와 processing clock 사이 multi-bit pixel CDC에 Gray pointer FIFO가 필요하다. |

각 모듈은 기존 `risk_zero_*` 명명과 reset convention에 맞췄고 독립 testbench를 추가했다.

## 수정한 결함

ZIP의 `sccb_master.sv`는 OV7670 register read에서 register-address 전송 뒤 STOP 없이 repeated START로 곧바로 read address를 전송했다. OV7670 read는 다음 두 transmission으로 구현했다.

```text
START → 0x42 → register → STOP
START → 0x43 → data → STOP
```

새 testbench는 내부 완료 신호만 검사하지 않고 외부 SIO_C/SIO_D 버스에서 START 2회, STOP 2회와 `0x42`, register, `0x43`, 반환 데이터를 직접 해독한다.

기존 Vivado 회귀 스크립트는 testbench의 `$fatal`이 발생해도 다음 simulation을 계속하고 마지막에 전체 PASS를 출력할 수 있었다. 각 testbench의 고유 PASS marker가 XSIM log에 없으면 Tcl 자체가 실패하도록 강화했다.

## 반영하지 않은 부분

| 후보 | 판단 | 이유 |
| --- | --- | --- |
| 48-write OV7670 init table | 제외 | 소스 revision이 고정되지 않았고 실제 module 전압·XCLK·DVP byte order·geometry가 미검증이다. 또한 원본 controller는 ID 확인 전에 전체 table을 먼저 썼다. |
| 전체 `top.sv`와 full candidate XDC | 제외 | 미확정 Camera/ESP32 pin·timing·전압과 24 MHz/QVGA 값을 한꺼번에 고정한다. 현재 결정 게이트와 충돌한다. |
| SPI register/protocol 전체 | 보류 | SPI mode·clock·offset·Snapshot CRC가 아직 시스템 계약으로 승인되지 않았다. Safety toggle/GPIO와 Vision data plane도 별도 검토가 필요하다. |
| ESP32 board pins/adapter | 보류 | 실제 `YD-ESP32-S3 Type A V1.5` pin 충돌과 flash/PSRAM variant를 확인하지 않았다. 기존 Door Hub 상태 코어를 대체하지 않는다. |
| 중복 DVP RX·Vision pipeline | 제외 | 현재 검증된 DVP RX와 motion core를 우회하고, 설치 영상 없이 threshold·presence 정책을 고정한다. |
| Debug Dashboard | 보류 | 아직 승인되지 않은 SPI packet/debug transport에 결합되어 있다. 프로토콜 확정 뒤 host-only viewer 부분을 다시 검토한다. |

ZIP 원본이나 build 산출물은 저장소에 복사하지 않았다.

## 검증 결과

- FPGA Python protocol/reference/asset tests: 17/17 PASS
- Windows AMD Vivado 2025.2 XSIM: 기존 5개 + 신규 4개, 총 9/9 PASS
- 신규 testbench: SCCB write/read framing, PID/VER success·ID fault·timeout, YUV422 양쪽 byte phase, async FIFO order·underflow·overflow
- Windows AMD Vivado 2025.2 Artix-7 OOC synthesis: 신규 primitive 4개 모두 PASS, 오류·경고 0건
- async FIFO: 16×32 storage가 distributed RAM으로 추론됨을 합성 보고서에서 확인
- 미실행: 새 primitive의 Camera top 연결과 전체 design place/route/timing
- 미검증: 실제 OV7670 SCCB ACK/ID, PCLK/VSYNC/HREF, frame geometry, 레벨 변환

하드웨어 배선 시험은 level shifting 또는 보호 저항 준비 전까지 중단 상태다.
