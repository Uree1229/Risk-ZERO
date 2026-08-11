# RISK-ZERO 시청각 검증 판정 및 평가 방안

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.3 |
| 기준일 | 2026-08-11 |
| 이전 문서 | 현관 위험도 산정 방안 |
| 현재 범위 | 음성 도어락 제어 요청의 시청각 검증 |

파일명은 기존 링크 호환을 위해 유지한다. 현재 시스템은 사람의 위험도를 계산하지 않고, 이번 발화가 카메라 영상과 마이크 음성에서 일관되는지를 검증한다.

## 1. 검증 질문

한 번의 제어 요청마다 다음 질문에 답한다.

1. 문 앞에 사람이 한 명 있는가?
2. 입술 영역과 음성이 충분히 관측되는가?
3. 화면 속 사람이 실제로 말하고 있는가?
4. 음성과 입술 움직임의 시간차가 허용 범위인가?
5. 재생 음성·화면 재생·합성 흔적이 의심되지 않는가?
6. 방금 발급한 문구를 제한시간 안에 말했는가?
7. 요청과 nonce가 만료되거나 재사용되지 않았는가?

하나라도 확실히 위반하면 `BLOCK`, 판단 자료가 부족하면 `INCONCLUSIVE`, 모두 충족하면 `PASS`다.

## 2. 입력 요소

| 그룹 | 필드 | 단위·범위 | 역할 |
| --- | --- | --- | --- |
| 존재 | `person_present` | boolean | 화면 속 사람 존재 |
| 얼굴 | `face_count` | 0 이상 정수 | 1명만 허용 |
| 입술 | `mouth_visible` | boolean | 입술 가림 확인 |
| 음성 | `audio_detected` | boolean | 음성 구간 존재 |
| 싱크 | `av_offset_ms` | ms | 음성·영상 시간차 |
| 싱크 | `sync_confidence` | 0~1 | 싱크 판정 신뢰도 |
| 화자 | `active_speaker_score` | 0~1 | 화면 속 사람이 말하는 정도 |
| 음성 공격 | `audio_spoof_score` | 0~1 | 재생·합성 의심 |
| 영상 공격 | `visual_spoof_score` | 0~1 | 화면 재생·합성 의심 |
| 문구 | `challenge_matched` | true/false/null | 발급 문구 일치 |
| 품질 | `audio_quality`, `video_quality` | 4단계 | 결측·노이즈·가림 |
| 시간 | `clock_synchronized` | boolean | 동일 시간축 확인 |

## 3. 초기 판정 규칙

```text
필수 필드 누락·시계 불일치·품질 bad/missing
  → INCONCLUSIVE

얼굴 0명/2명 이상·challenge 불일치·nonce 재사용
  → BLOCK

|av_offset_ms| > 200
또는 sync_confidence < 0.75
또는 active_speaker_score < 0.70
또는 audio_spoof_score >= 0.45
  → BLOCK

모든 필수 조건 충족
  → PASS
```

초기값은 구현과 시나리오 시험을 위한 가설이다. 논문 수치를 그대로 제품 임계값으로 사용한 것이 아니며, 동일 카메라·마이크·거리·소음 환경에서 수집한 데이터로 조정한다.

## 4. 점수 사용법

하나의 종합 “진짜 확률”을 만들지 않는다. 모델별 점수를 그대로 근거로 남기고 정책 계층에서 조건을 결합한다. 이렇게 해야 어느 조건 때문에 차단됐는지 설명하고 모델 한 개를 교체하기 쉽다.

화면의 `confidence`는 해당 판정 근거의 최소 신뢰도 또는 정책이 계산한 보조 표시다. 사람의 신원 확률, 범죄 가능성, 문을 열어도 되는 확률로 해석하지 않는다.

## 5. 모델 어댑터

| 어댑터 | 입력 | 출력 | 현재 상태 |
| --- | --- | --- | --- |
| `AVSyncModelAdapter` | 동일 구간 음성·얼굴 영상 | offset, confidence | 인터페이스만 구현 |
| `ActiveSpeakerModelAdapter` | 얼굴 track·음성 구간 | active speaker score | 인터페이스만 구현 |
| `AudioSpoofModelAdapter` | 음성 구간 | spoof score | 인터페이스만 구현 |
| `EvidenceAssembler` | 모델 결과·품질·문구 | `AnalysisEvidence` | DEMO 조립 가능 |

실제 모델은 `edge/risk_zero_av/models.py`의 Protocol을 구현해 연결한다. 모델이 없거나 예외가 발생하면 가짜 PASS를 만들지 않고 판단 불가로 넘긴다.

## 6. 시험 데이터

최소 시나리오는 다음과 같다.

- 현장 정상 발화
- 스마트폰 스피커로 음성만 재생
- 다른 사람의 영상·음성을 화면에서 재생
- 음성을 100/200/300/500/800ms 지연
- 얼굴 없음, 두 명 이상, 입술 가림
- 밝기 저하, 역광, 거리 변화, 배경 소음
- 합성 음성, 편집 영상, 더빙 영상
- 틀린 challenge, 만료 challenge, nonce 재사용
- 네트워크 재전송, 장치 재부팅, 제어 토큰 만료

사람, 장치 위치, 문구, 시간대를 나눠 train/validation/test가 섞이지 않게 한다. 같은 클립을 조금 변형한 데이터가 양쪽에 들어가면 성능이 부풀려진다.

## 7. 평가 지표

| 지표 | 의미 |
| --- | --- |
| FAR | 공격 또는 비정상 요청을 PASS한 비율 |
| FRR | 정상 현장 발화를 차단한 비율 |
| APCER | 공격 표현을 정상으로 분류한 비율 |
| BPCER | 정상 표현을 공격으로 분류한 비율 |
| Inconclusive rate | 자료 부족으로 판단하지 못한 비율 |
| p50/p95 latency | 일반·지연 처리시간 |
| replay rejection | 재생 공격 차단률 |
| nonce replay rejection | 재사용 요청 차단률 |

안전 관련 시연에서는 전체 정확도 하나보다 공격 종류별 FAR과 실패 원인을 먼저 공개한다.

## 8. 통과 기준 제안

캡스톤 1차 통합 시험의 목표값이며 실제 제품 인증 기준은 아니다.

- nonce 재사용과 만료 요청 차단: 100%
- 입력 누락 시 제어 출력 없음: 100%
- 정상 발화 30회 중 PASS 24회 이상
- 음성·영상 재생 공격 각 20회 중 PASS 0회 목표
- 처리시간 p95 3초 이내
- 모든 결과에 reason code, 모델·정책 버전, 시각 기록

목표를 못 맞추면 임계값을 숨겨 조정하지 않고 실패 조건과 데이터 수를 기록한다.

## 9. 참고 근거

- Chung & Zisserman, [Out of Time: Automated Lip Sync in the Wild](https://www.robots.ox.ac.uk/~vgg/publications/2016/Chung16a/chung16a.pdf): 음성·입술 동기화 모델 구조 참고
- Tao et al., [Is Someone Speaking? Exploring Long-term Temporal Features for Audio-visual Active Speaker Detection](https://arxiv.org/abs/2107.06592): 활성 화자 판정 구조 참고
- [ASVspoof](https://www.asvspoof.org/): 재생·합성 음성 공격 분류와 평가 참고
- [ISO/IEC 30107-3](https://www.iso.org/standard/79520.html): presentation attack 평가 용어 참고
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): 음성 생체 인증의 한계와 다중 요소 원칙 참고

논문 모델을 연결했다는 뜻은 아니다. 현재 코드는 어댑터와 정책·테스트 기반만 구현되어 있다.
