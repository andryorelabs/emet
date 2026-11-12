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
    menu: "메뉴",
    close: "닫기",
    skip: "본문으로 건너뛰기",
  },
  theme: {
    label: "테마",
    light: "라이트",
    dark: "다크",
    system: "시스템",
  },
  hero: {
    name: "emet",
    lineOne: "스펙에서 머지까지,",
    lineTwo: "승인은 한 번.",
    sentence: "Claude Code와 Codex용 플러그인. 아이디어에서 머지된 변경까지, 승인은 한 번.",
    install: "emet 설치",
    readDocs: "문서 읽기",
    alt: "세 개의 시냇물이 하나의 강으로 합쳐지는 그림 속 계곡. 계단식 밭과, 고요한 하늘 아래 풀이 덮인 언덕 위의 작은 점토 골렘.",
  },
  how: {
    heading: "아이디어에서 머지까지",
    install: "설치하세요.",
    describe: "설명하세요.",
    land: "머지되는 것을 지켜보세요.",
    tabClone: "클론에서",
    request: "build the Website",
    youType: "입력",
    emetReplies: "emet 응답",
    alt: "세 개울이 하나의 강으로 합쳐지는 계곡.",
    merged: "병합됨",
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
  stats: {
    label: "숫자로 보기",
    items: [
      { value: "3", label: "트래커", detail: "Linear, GitHub Issues 또는 로컬 파일" },
      { value: "10", label: "언어", detail: "영어와 9개 언어 번역" },
      { value: "1", label: "승인", detail: "코드 작성 전에 스펙과 티켓" },
      { value: "MIT", label: "라이선스", detail: "자유롭게 사용하고 포크할 수 있음" },
    ],
  },
  faq: {
    heading: "질문",
    items: [
      {
        question: "무엇이 필요한가요?",
        answer:
          "Claude Code 또는 Codex CLI, git, 인증된 gh, mattpocock-skills 플러그인이 필요하며 Linux 또는 macOS에서 동작합니다.",
      },
      {
        question: "Windows에서 동작하나요?",
        answer: "WSL을 통해서만 가능합니다. Linux와 macOS에서는 그대로 동작합니다.",
      },
      {
        question: "어떤 트래커를 지원하나요?",
        answer: "Linear, GitHub Issues 또는 로컬 파일을 지원합니다.",
      },
      {
        question: "CI가 실패하면 어떻게 되나요?",
        answer: "웨이브는 몇 번 수정을 시도한 뒤 당신의 확인을 기다립니다.",
      },
      {
        question: "웨이브는 어떻게 멈추나요?",
        answer: "티켓에 플래그를 지정하세요. 플래그가 있는 동안에는 아무것도 병합되지 않습니다.",
      },
      {
        question: "emet은 Anthropic 또는 OpenAI가 만들었나요?",
        answer:
          "아니요. emet은 Anthropic 또는 OpenAI와 제휴하거나 Anthropic 또는 OpenAI의 보증을 받지 않았습니다.",
      },
    ],
    more: "더 많은 질문",
  },
  about: {
    heading: "이름이 emet인 이유",
    lineOne: "히브리어로 진리라는 뜻입니다. 골렘은 그 말로 생명을 얻은 점토입니다.",
    lineTwoBefore: "첫 글자를 지우면 met, 곧 죽음이라고 읽힙니다. 골렘은 멈춥니다. 여기서는 ",
    flag: "플래그가 있으면 아무것도 머지되지 않습니다",
    lineTwoAfter: ".",
    truth: "진리",
    dead: "죽음",
    wordLabel: "emet, 진리, 첫 글자를 지우면 met, 죽음이 됩니다",
    caption: "그려진 emet의 골렘.",
    role: "메인테이너",
    alt: "풀이 덮인 언덕 위 emet 골렘을 가까이서 그린 그림. 골든아워의 빛, 이끼와 점토의 질감, 머리 위의 작은 새싹.",
  },
  closing: {
    heading: "저장소 하나에서 시작해 보세요",
    action: "emet 설치",
    alt: "낮게 깔린 아침 안개 아래의 계곡. 옅은 해와 파스텔빛 하늘.",
  },
  footer: {
    description: "Claude Code와 Codex용 플러그인.",
    notice: "Anthropic 또는 OpenAI와 제휴하거나 Anthropic 또는 OpenAI의 보증을 받지 않았습니다",
    docs: "문서",
    whatsNew: "새 소식",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "그림은 메인테이너의 프롬프트로 AI가 생성했습니다.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "보안",
    contributing: "기여하기",
    product: "제품",
    trust: "신뢰",
    builtBy: "제작 AndryOre",
  },
  links: {
    newTab: "(새 탭에서 열림)",
  },
  share: {
    ogAlt: "emet: 명세에서 병합까지, 승인은 단 한 번.",
  },
} satisfies UiStrings;
