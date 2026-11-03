"""노선 메타데이터 (subwayId 기준). 서버, 빌드 스크립트가 같이 쓴다."""

# ride: 역 사이 평균 소요(분), h: 평균 배차 간격(분). 실시간 값이 없을 때 추정용.
# first/last: 대략적인 첫차·막차 (역마다 조금씩 다름, 24:00 넘으면 다음 날 새벽). 실시간 막차 표시가 있으면 그걸 우선.
LINE_META = {
    "1001": {"name": "1호선", "short": "1", "c": "#0052A4", "ride": 2.5, "h": 6, "first": "05:20", "last": "24:50"},
    "1002": {"name": "2호선", "short": "2", "c": "#00A84D", "ride": 2, "h": 4, "first": "05:30", "last": "25:00"},
    "1003": {"name": "3호선", "short": "3", "c": "#EF7C1C", "ride": 2, "h": 6, "first": "05:30", "last": "25:00"},
    "1004": {"name": "4호선", "short": "4", "c": "#00A5DE", "ride": 2, "h": 5, "first": "05:30", "last": "25:00"},
    "1005": {"name": "5호선", "short": "5", "c": "#996CAC", "ride": 2, "h": 6, "first": "05:30", "last": "25:00"},
    "1006": {"name": "6호선", "short": "6", "c": "#CD7C2F", "ride": 2, "h": 7, "first": "05:30", "last": "25:00"},
    "1007": {"name": "7호선", "short": "7", "c": "#747F00", "ride": 2, "h": 6, "first": "05:30", "last": "25:00"},
    "1008": {"name": "8호선", "short": "8", "c": "#E6186C", "ride": 2, "h": 6, "first": "05:30", "last": "25:00"},
    "1009": {"name": "9호선", "short": "9", "c": "#BDB092", "ride": 2, "h": 6, "first": "05:30", "last": "24:50"},
    "1063": {"name": "경의중앙선", "short": "경의", "c": "#77C4A3", "ride": 3, "h": 12, "first": "05:20", "last": "24:30"},
    "1065": {"name": "공항철도", "short": "공항", "c": "#0090D2", "ride": 3.5, "h": 10, "first": "05:20", "last": "24:00"},
    "1067": {"name": "경춘선", "short": "경춘", "c": "#0C8E72", "ride": 3.5, "h": 20, "first": "05:10", "last": "24:20"},
    "1075": {"name": "수인분당선", "short": "수분", "c": "#FABE00", "ride": 2.5, "h": 8, "first": "05:30", "last": "24:40"},
    "1077": {"name": "신분당선", "short": "신분", "c": "#D4003B", "ride": 3, "h": 6, "first": "05:30", "last": "24:50"},
    "1081": {"name": "경강선", "short": "경강", "c": "#003DA5", "ride": 4, "h": 15, "first": "05:30", "last": "24:00"},
    "1092": {"name": "우이신설선", "short": "우이", "c": "#B0CE18", "ride": 1.5, "h": 5, "first": "05:30", "last": "24:40"},
    "1093": {"name": "서해선", "short": "서해", "c": "#81A914", "ride": 3, "h": 15, "first": "05:30", "last": "24:00"},
    "1094": {"name": "신림선", "short": "신림", "c": "#6789CA", "ride": 1.5, "h": 5, "first": "05:30", "last": "24:40"},
    "1032": {"name": "GTX-A", "short": "GTX", "c": "#9A6292", "ride": 5, "h": 10, "first": "05:30", "last": "24:00"},
}


def load_env(root):
    """root/.env 의 KEY=VALUE 를 환경변수로 (이미 있으면 유지)."""
    import os
    path = os.path.join(root, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
