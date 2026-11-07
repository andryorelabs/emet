import type { UiStrings } from "./en";

/**
 * Korean strings of the home page. AI translation, not human reviewed.
 */
export const ko = {
  meta: {
    title: "emet: 스펙에서 머지까지, 승인은 한 번.",
    description:
      "승인 한 번으로 스펙에서 머지까지. 격리된 worktree에서 병렬로 일하는 worker, 웨이브마다 리뷰, 머지 전에 CI 통과.",
  },
  nav: {
    label: "메인",
    docs: "문서",
    whatsNew: "새 소식",
    github: "GitHub",
    language: "언어",
    home: "emet, 홈",
  },
  hero: {
    name: "emet",
    lineOne: "스펙에서 머지까지,",
    lineTwo: "승인은 한 번.",
    sentence: "Claude Code용 플러그인. 아이디어에서 머지된 변경까지, 승인은 한 번.",
    install: "emet 설치",
    readDocs: "문서 읽기",
    alt: "세 개의 시냇물이 하나의 강으로 합쳐지는 그림 속 계곡. 계단식 밭과, 고요한 하늘 아래 풀이 덮인 언덕 위의 작은 점토 골렘.",
  },
  how: {
    heading: "아이디어에서 머지까지",
    install: "설치하세요.",
    describe: "설명하세요.",
    land: "머지되는 것을 지켜보세요.",
    tabPlugin: "플러그인",
    tabClone: "클론에서",
    request: "build the Website",
    alt: "황금빛 속의 그림 속 계곡. 계단식 밭 위, 풀이 덮인 언덕에 선 작은 점토 골렘.",
  },
  showcase: {
    heading: "웨이브가 머지됩니다",
    headingHeld: "웨이브가 대기합니다",
    status: "웨이브 2 리뷰 완료. CI 통과. 머지됨, 티켓 3개 종료.",
    statusHeld: "웨이브 2 보류: 티켓 1개에 플래그. 머지된 것은 없습니다.",
    flag: "티켓 #255 표시",
  },
  features: {
    heading: "실행이 지키는 것",
    notes: [
      { title: "승인은 한 번", line: "스펙과 티켓을 한 번만 검토합니다." },
      { title: "웨이브마다 리뷰", line: "리뷰어가 모든 웨이브를 확인합니다." },
      { title: "플래그가 있으면 머지하지 않음", line: "플래그 하나가 웨이브 전체를 보류합니다." },
      {
        title: "머지 전에 CI 통과",
        line: "실패한 체크는 몇 번 수정을 시도한 뒤 당신의 판단을 기다립니다.",
      },
      { title: "격리된 worktree", line: "worker마다 git worktree 하나." },
      { title: "트래커는 선택, 없어도 됨", line: "Linear, GitHub Issues 또는 로컬 파일." },
    ],
  },
  about: {
    heading: "이름이 emet인 이유",
    lineOne: "히브리어로 진리라는 뜻입니다. 골렘은 그 말로 생명을 얻은 점토입니다.",
    lineTwo: "글자 하나를 지우면 멈춥니다. 여기서는 플래그가 있으면 아무것도 머지되지 않습니다.",
    signature: "AndryOre, 메인테이너",
    alt: "풀이 덮인 언덕 위 emet 골렘을 가까이서 그린 그림. 골든아워의 빛, 이끼와 점토의 질감, 머리 위의 작은 새싹.",
  },
  closing: {
    heading: "저장소 하나에서 시작해 보세요",
    action: "emet 설치",
    alt: "낮게 깔린 아침 안개 아래의 계곡. 옅은 해와 파스텔빛 하늘.",
  },
  footer: {
    description: "Claude Code용 플러그인.",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "문서",
    whatsNew: "새 소식",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "그림은 메인테이너의 프롬프트로 AI가 생성했습니다.",
  },
} satisfies UiStrings;
