# RZFP UDP 프레임 프로토콜 v1

ESP32-CAM이 Arty A7-100T로 보내는 `160×120 GRAY8` 한 프레임을 여러 UDP 패킷으로 나눈다. 모든 다중 바이트 정수는 big-endian이다.

## 헤더 · 32 bytes

| Offset | 크기 | 필드 | 값 |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | `0x525A4650`, ASCII `RZFP` |
| 4 | 1 | version | `1` |
| 5 | 1 | pixel format | `1`, GRAY8 |
| 6 | 2 | header bytes | `32` |
| 8 | 4 | frame ID | 프레임마다 1 증가 |
| 12 | 4 | captured ms | ESP32 부팅 후 `millis()` |
| 16 | 2 | width | `160` |
| 18 | 2 | height | `120` |
| 20 | 2 | chunk index | 0부터 시작 |
| 22 | 2 | chunk count | 현재 기본값 `16` |
| 24 | 4 | payload offset | 프레임 버퍼 내 byte offset |
| 28 | 2 | payload bytes | 최대 `1200` |
| 30 | 2 | reserved | `0` |

헤더 뒤에 GRAY8 payload가 이어진다. 한 프레임은 19,200 bytes이고 기본 payload 1,200 bytes를 사용하므로 16개 패킷이다.

## 손실 처리

- UDP 패킷 순서는 보장하지 않으므로 chunk bit mask로 재조립한다.
- 같은 chunk를 다시 받으면 중복 합산하지 않는다.
- 새 frame ID가 오면 완성되지 않은 이전 프레임은 폐기한다.
- 16개 chunk와 총 19,200 bytes가 모두 있어야 FPGA에 전달한다.
- 손실 프레임은 재전송하지 않는다. 실시간 동선에서는 오래된 프레임 복구보다 다음 프레임 처리를 우선한다.

UDP checksum 외의 애플리케이션 checksum은 v1에 넣지 않았다. 실제 패킷 손상이 반복되면 v2에서 frame CRC32를 추가한다.
