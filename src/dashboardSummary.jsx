import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./dashboardSummary.css";
import {
  getTodayDashboard,
  getWeeklyDashboard,
} from "./api/dashboardApi";
import { getMyProfile } from "./api/userApi";
import { deleteSnapshots, getSnapshots } from "./api/snapshotApi";

const EMPTY_TODAY_DATA = {
  totalTime: 0,
  goodTime: 0,
  badTime: 0,
  warningTime: 0,
  warningCount: 0,
  goodPostureRate: 0,
};

const EMPTY_WEEKLY_DATA = {
  summary: {
    totalTime: 0,
    goodTime: 0,
    badTime: 0,
    warningTime: 0,
    warningCount: 0,
    totalMinutes: 0,
    goodPostureRate: 0,
  },
  chart: [],
  peakUsageDay: null,
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const WEEKLY_GRAPH_DEFAULT_MAX_MINUTES = 60;
const WEEKLY_GRAPH_MIN_TARGET_MINUTES = 10;
const WEEKLY_GRAPH_TICK_COUNT = 5;
const DASHBOARD_REFRESH_INTERVAL_MS = 5000;

const DAY_LABEL_MAP = {
  Sun: "일",
  Mon: "월",
  Tue: "화",
  Wed: "수",
  Thu: "목",
  Fri: "금",
  Sat: "토",
};

const STRETCH_RECOMMENDATIONS = {
  1: [
    {
      title: "턱 당기기",
      image: "/Stretching/stage1_1_chin_tuck.png",
    },
    {
      title: "목 좌우 기울이기",
      image: "/Stretching/stage1_2_neck_tilt.png",
    },
    {
      title: "어깨 돌리기",
      image: "/Stretching/stage1_3_shoulder_roll.png",
    },
    {
      title: "가슴 펴기",
      image: "/Stretching/stage1_4_chest_open.png",
    },
  ],
  2: [
    {
      title: "승모근 스트레칭",
      image: "/Stretching/stage2_1_trapezius_stretch.png",
    },
    {
      title: "견갑골 모으기",
      image: "/Stretching/stage2_2_scapular_squeeze.png",
    },
    {
      title: "벽 천사 운동",
      image: "/Stretching/stage2_3_wall_angel.png",
    },
    {
      title: "목뒤 근육 늘리기",
      image: "/Stretching/stage2_4_neck_back_stretch.png",
    },
  ],
  3: [
    {
      title: "턱 당기기 심화",
      image: "/Stretching/stage3_1_advanced_chin_tuck.png",
    },
    {
      title: "문틀 가슴 스트레칭",
      image: "/Stretching/stage3_2_doorway_chest_stretch.png",
    },
    {
      title: "흉추 펴기",
      image: "/Stretching/stage3_3_thoracic_extension.png",
    },
    {
      title: "등 상부 강화 운동",
      image: "/Stretching/stage3_4_upper_back_strength.png",
    },
  ],
};

function getDonutDegrees(value, total) {
  if (!total) {
    return 0;
  }

  return (value / total) * 360;
}

function getTotalTimeDegrees(totalSeconds) {
  const maxSeconds = 12 * 60 * 60;

  if (!totalSeconds) {
    return 0;
  }

  return Math.min((totalSeconds / maxSeconds) * 360, 360);
}

function getLevelText(goodPostureRate) {
  if (goodPostureRate >= 80) {
    return "위험수준 1 단계";
  }

  if (goodPostureRate >= 60) {
    return "위험수준 2 단계";
  }

  return "위험수준 3 단계";
}

function getStretchLevel(goodPostureRate) {
  if (goodPostureRate >= 80) {
    return 1;
  }

  if (goodPostureRate >= 60) {
    return 2;
  }

  return 3;
}

function formatHoursAndMinutes(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return { hours, minutes };
}

function getWeeklyGraphRoundUnit(maxMinutes) {
  if (maxMinutes <= 60) {
    return 5;
  }

  if (maxMinutes <= 120) {
    return 10;
  }

  if (maxMinutes <= 240) {
    return 15;
  }

  if (maxMinutes <= 480) {
    return 30;
  }

  return 60;
}

function getWeeklyGraphScale(chart) {
  if (!chart.length) {
    return {
      maxMinutes: WEEKLY_GRAPH_DEFAULT_MAX_MINUTES,
      ticks: [60, 50, 40, 30, 20, 10],
    };
  }

  const maxGoodMinutes = Math.max(...chart.map((day) => day.goodMinutes));
  const targetMaxMinutes = Math.max(maxGoodMinutes, WEEKLY_GRAPH_MIN_TARGET_MINUTES);
  const roundUnit = getWeeklyGraphRoundUnit(targetMaxMinutes);
  const maxMinutes = Math.max(
    WEEKLY_GRAPH_MIN_TARGET_MINUTES,
    Math.ceil(targetMaxMinutes / roundUnit) * roundUnit
  );
  const tickStep = maxMinutes / WEEKLY_GRAPH_TICK_COUNT;
  const ticks = [];

  for (let value = maxMinutes; value > 0; value -= tickStep) {
    ticks.push(value);
  }

  return {
    maxMinutes,
    ticks,
  };
}

function formatGraphTick(minutes) {
  return `${minutes}min`;
}

function toProfileImageUrl(profileImage) {
  if (!profileImage) {
    return "/images/Ellipse3.png";
  }

  if (profileImage.startsWith("http://") || profileImage.startsWith("https://")) {
    return profileImage;
  }

  return API_BASE_URL ? `${API_BASE_URL}${profileImage}` : profileImage;
}

function mapTodayData(rawTodayData) {
  if (!rawTodayData) {
    return EMPTY_TODAY_DATA;
  }

  return {
    totalTime: rawTodayData.total_usage_seconds ?? 0,
    goodTime: rawTodayData.normal_seconds ?? 0,
    badTime: rawTodayData.danger_seconds ?? 0,
    warningTime: rawTodayData.warning_seconds ?? 0,
    warningCount: rawTodayData.danger_count ?? 0,
    goodPostureRate: rawTodayData.good_posture_rate ?? 0,
  };
}

function mapWeeklyData(rawWeeklyData) {
  if (!rawWeeklyData) {
    return EMPTY_WEEKLY_DATA;
  }

  const chart = (rawWeeklyData.chart ?? []).map((item) => ({
    day: DAY_LABEL_MAP[item.day_label] || item.day_label,
    date: item.date,
    goodTime: item.normal_seconds ?? 0,
    goodMinutes: item.normal_seconds ? Math.round(item.normal_seconds / 60) : 0,
    totalMinutes: item.total_usage_minutes ?? 0,
    goodPostureRate: item.good_posture_rate ?? 0,
  }));

  const peakGoodPostureDay = chart.reduce((best, item) => {
    if (!best || item.goodTime > best.goodTime) {
      return item;
    }

    return best;
  }, null);

  return {
    summary: {
      totalTime: rawWeeklyData.summary?.total_usage_seconds ?? 0,
      goodTime: rawWeeklyData.summary?.normal_seconds ?? 0,
      badTime: rawWeeklyData.summary?.danger_seconds ?? 0,
      warningTime: rawWeeklyData.summary?.warning_seconds ?? 0,
      warningCount: rawWeeklyData.summary?.danger_count ?? 0,
      totalMinutes: rawWeeklyData.summary?.total_usage_minutes ?? 0,
      goodPostureRate: rawWeeklyData.summary?.good_posture_rate ?? 0,
    },
    chart,
    peakUsageDay: peakGoodPostureDay
      ? {
          day: peakGoodPostureDay.day,
          date: peakGoodPostureDay.date,
          totalMinutes: peakGoodPostureDay.totalMinutes,
          goodMinutes: peakGoodPostureDay.goodMinutes,
        }
      : null,
  };
}

function DashboardSummary() {
  const [tab, setTab] = useState("daily");
  const [todayData, setTodayData] = useState(EMPTY_TODAY_DATA);
  const [weeklyData, setWeeklyData] = useState(EMPTY_WEEKLY_DATA);
  const [displayName, setDisplayName] = useState("사용자");
  const [profileImage, setProfileImage] = useState("/images/Ellipse3.png");
  const [snapshotConsent, setSnapshotConsent] = useState(null);
  const [snapshotItems, setSnapshotItems] = useState([]);
  const [isSnapshotDeleteMode, setIsSnapshotDeleteMode] = useState(false);
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState([]);
  const [activeSnapshot, setActiveSnapshot] = useState(null);
  const [snapshotToastMessage, setSnapshotToastMessage] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const scrollPositions = useRef({});

  const goodRatio = getDonutDegrees(todayData.goodTime, todayData.totalTime);
  const badRatio = getDonutDegrees(todayData.badTime, todayData.totalTime);
  const totalRatio = getTotalTimeDegrees(todayData.totalTime);
  const totalTimeDisplay = formatHoursAndMinutes(todayData.totalTime);
  const goodTimeDisplay = formatHoursAndMinutes(todayData.goodTime);
  const badTimeDisplay = formatHoursAndMinutes(todayData.badTime);
  const userLevelText = getLevelText(todayData.goodPostureRate);
  const stretchLevel = getStretchLevel(todayData.goodPostureRate);

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    navigate("/login");
  };

  const handleTabChange = (newTab) => {
    if (scrollRef.current) {
      scrollPositions.current[tab] = scrollRef.current.scrollTop;
    }

    setTab(newTab);
  };

  const handleSnapshotDeleteMode = () => {
    setIsSnapshotDeleteMode((prev) => {
      const next = !prev;

      if (!next) {
        setSelectedSnapshotIds([]);
        setSnapshotToastMessage("");
        setIsDeleteConfirmOpen(false);
      } else {
        setSnapshotToastMessage("삭제할 이미지를 선택해주세요");
      }

      return next;
    });
  };

  const handleSnapshotClick = (snapshot) => {
    if (!isSnapshotDeleteMode) {
      setActiveSnapshot(snapshot);
      return;
    }

    setSelectedSnapshotIds((prev) =>
      prev.includes(snapshot.id)
        ? prev.filter((id) => id !== snapshot.id)
        : [...prev, snapshot.id]
    );
  };

  const handleSelectAllSnapshots = () => {
    setSelectedSnapshotIds((prev) =>
      prev.length === snapshotItems.length
        ? []
        : snapshotItems.map((item) => item.id)
    );
  };

  const handleRequestDeleteSnapshots = () => {
    if (selectedSnapshotIds.length === 0) {
      setSnapshotToastMessage("삭제할 이미지를 선택해주세요");
      return;
    }

    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteSnapshots = async () => {
    try {
      const res = await deleteSnapshots(selectedSnapshotIds);
      const deletedIds = res.data.data?.deleted_ids || [];

      setSnapshotItems((prev) =>
        prev.filter((item) => !deletedIds.includes(item.id))
      );
      setSelectedSnapshotIds([]);
      setIsSnapshotDeleteMode(false);
      setIsDeleteConfirmOpen(false);
      setSnapshotToastMessage("");
    } catch (error) {
      console.error("스냅샷 삭제 실패:", error);
      const message =
        error.response?.data?.message || "스냅샷 삭제에 실패했습니다.";
      alert(message);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async ({ showAlert = false } = {}) => {
      try {
        const [todayRes, weeklyRes] = await Promise.all([
          getTodayDashboard(),
          getWeeklyDashboard(),
        ]);

        if (!isMounted) {
          return;
        }

        setTodayData(mapTodayData(todayRes.data.data));
        setWeeklyData(mapWeeklyData(weeklyRes.data.data));
      } catch (err) {
        console.error(err);

        if (showAlert && isMounted) {
          const message =
            err.response?.data?.message || "대시보드 데이터를 불러오지 못했습니다.";
          alert(message);
        }
      }
    };

    fetchDashboardData({ showAlert: true });

    const refreshTimer = window.setInterval(() => {
      fetchDashboardData();
    }, DASHBOARD_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getMyProfile();
        const userData = res.data.data;

        setDisplayName(userData.nickname || userData.username || "사용자");
        setProfileImage(toProfileImageUrl(userData.profile_image));
        setSnapshotConsent(Boolean(userData.snapshot_consent));
      } catch (error) {
        console.error("사용자 정보 불러오기 실패:", error);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    if (snapshotConsent !== true) {
      if (snapshotConsent === false) {
        setSnapshotItems([]);
        setSelectedSnapshotIds([]);
        setIsSnapshotDeleteMode(false);
        setActiveSnapshot(null);
        setSnapshotToastMessage("");
        setIsDeleteConfirmOpen(false);
      }

      return undefined;
    }

    let isMounted = true;

    const fetchSnapshots = async () => {
      try {
        const res = await getSnapshots();

        if (isMounted) {
          setSnapshotItems(res.data.data || []);
        }
      } catch (error) {
        console.error("스냅샷 목록 불러오기 실패:", error);

        if (
          isMounted &&
          error.response?.status === 403 &&
          error.response?.data?.code === "SNAPSHOT_CONSENT_REQUIRED"
        ) {
          setSnapshotItems([]);
          setSnapshotConsent(false);
        }
      }
    };

    fetchSnapshots();

    return () => {
      isMounted = false;
    };
  }, [snapshotConsent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollPositions.current[tab] || 0;
    }
  }, [tab]);

  useEffect(() => {
    if (!snapshotToastMessage) {
      return undefined;
    }

    const toastTimer = window.setTimeout(() => {
      setSnapshotToastMessage("");
    }, 3000);

    return () => {
      window.clearTimeout(toastTimer);
    };
  }, [snapshotToastMessage]);

  return (
    <div className="dashboard-summary">
      <div className="dashboard-header">
        <div className="dashboard-left">
          <div className="dashboard-logo-row">
            <img
              src="/images/NeckOn.png"
              className="dashboardSummary-logo"
              alt="NeckOn 로고"
              onClick={() => {
                handleTabChange("daily");
                navigate("/dashboardSummary");
              }}
            />
            <div className="dashboard-top-line"></div>
          </div>

          <div className="dashboard-tabs">
            <div
              className={`dashboard-tab ${tab === "daily" ? "active" : ""}`}
              onClick={() => handleTabChange("daily")}
            >
              하루요약
            </div>

            <div
              className={`dashboard-tab ${tab === "weekly" ? "active" : ""}`}
              onClick={() => handleTabChange("weekly")}
            >
              주간분석
            </div>

            <div
              className={`dashboard-tab ${tab === "stretch" ? "active" : ""}`}
              onClick={() => handleTabChange("stretch")}
            >
              단계별 스트레칭
            </div>

            <div
              className={`dashboard-tab ${tab === "snapshot" ? "active" : ""}`}
              onClick={() => handleTabChange("snapshot")}
            >
              스냅샷 갤러리
            </div>

            <div
              className="dashboard-tab"
              onClick={() => navigate("/dashboard")}
            >
              분석하러가기
            </div>
          </div>

          <div className="dashboard-tab-line"></div>
        </div>

        <div className="user-card">
          <img
            src={profileImage}
            className="user-avatar"
            alt="user"
          />

          <div className="user-info">
            <div className="user-name-row">
              <div className="user-name">{displayName} 님</div>
              <button className="logout-btn" onClick={handleLogout}>
                로그아웃
              </button>
            </div>

            <div className="user-level">{userLevelText}</div>

            <button
              className="edit-btn"
              onClick={() => navigate("/mypage")}
            >
              회원정보 수정
            </button>
          </div>
        </div>
      </div>

      <div className="tab-content" ref={scrollRef}>
        {tab === "daily" && (
          <>
            <div className="summary-section">
              <div className="summary-title">오늘 총 분석 시간</div>
              <div className="summary-subtitle">
                웹캠 활성화 후 자세 분석 알고리즘이 가동된 총 누적 시간입니다.
              </div>

              <div className="donut-wrap">
                <div
                  className="donut-chart"
                  style={{
                    background: `conic-gradient(#111 0deg ${totalRatio}deg, #d9d9d9 ${totalRatio}deg 360deg)`,
                  }}
                >
                  <div className="donut-inner">
                    <div className="donut-time-big">
                      {totalTimeDisplay.hours}
                      <span className="donut-unit">시간</span>
                    </div>

                    <div className="donut-time-small">
                      {totalTimeDisplay.minutes}
                      <span className="donut-unit">분</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="summary-divider"></div>

            <div className="summary-section">
              <div className="summary-title">바른자세 유지 시간</div>
              <div className="summary-subtitle">
                전체 분석 시간 중 정상 자세로 판정된 누적 시간입니다.
              </div>

              <div className="donut-wrap">
                <div
                  className="donut-chart"
                  style={{
                    background: `conic-gradient(#95a86d 0deg ${goodRatio}deg, #d9d9d9 ${goodRatio}deg 360deg)`,
                  }}
                >
                  <div className="donut-inner">
                    <div className="donut-time-big">
                      {goodTimeDisplay.hours}
                      <span className="donut-unit">시간</span>
                    </div>

                    <div className="donut-time-small">
                      {goodTimeDisplay.minutes}
                      <span className="donut-unit">분</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="summary-divider"></div>

            <div className="summary-section">
              <div className="summary-title">이상 자세 누적 시간</div>
              <div className="summary-subtitle">
                위험 자세로 판정된 누적 시간과 경고 횟수를 보여줍니다.
              </div>

              <div className="donut-wrap">
                <div
                  className="donut-chart"
                  style={{
                    background: `conic-gradient(#c95a57 0deg ${badRatio}deg, #d9d9d9 ${badRatio}deg 360deg)`,
                  }}
                >
                  <div className="donut-inner">
                    <div className="donut-time-big">
                      {badTimeDisplay.hours}
                      <span className="donut-unit">시간</span>
                    </div>

                    <div className="donut-time-small">
                      {badTimeDisplay.minutes}
                      <span className="donut-unit">분</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bottom-alert">
              <span className="arrow">→</span>
              오늘 총 {todayData.warningCount}회의 위험 자세가 감지되었으며,
              누적 {badTimeDisplay.hours}시간 {badTimeDisplay.minutes}분 동안
              지속되었습니다.
            </div>
          </>
        )}

        {tab === "weekly" && <WeeklyReport weeklyData={weeklyData} />}

        {tab === "stretch" && (
          <StretchReport
            stretchLevel={stretchLevel}
            displayName={displayName}
          />
        )}

        {tab === "snapshot" && (
          <SnapshotGallery
            snapshotItems={snapshotItems}
            snapshotConsent={snapshotConsent}
            onGoToMyPage={() => navigate("/mypage")}
            isDeleteMode={isSnapshotDeleteMode}
            selectedSnapshotIds={selectedSnapshotIds}
            onToggleDeleteMode={handleSnapshotDeleteMode}
            onSnapshotClick={handleSnapshotClick}
            onSelectAll={handleSelectAllSnapshots}
            onRequestDelete={handleRequestDeleteSnapshots}
            onConfirmDelete={handleDeleteSnapshots}
            onCancelDelete={() => setIsDeleteConfirmOpen(false)}
            activeSnapshot={activeSnapshot}
            onClosePreview={() => setActiveSnapshot(null)}
            toastMessage={snapshotToastMessage}
            isDeleteConfirmOpen={isDeleteConfirmOpen}
          />
        )}
      </div>
    </div>
  );
}

function WeeklyReport({ weeklyData }) {
  const graphScale = getWeeklyGraphScale(weeklyData.chart);
  const graphAxisRows = [...graphScale.ticks, null];
  const averageGoodMinutes =
    weeklyData.chart.length > 0
      ? Math.round(
          weeklyData.chart.reduce((sum, day) => sum + day.goodMinutes, 0) /
            weeklyData.chart.length
        )
      : 0;

  return (
    <div className="weekly-report">
      <div className="weekly-title">주간 리포트</div>

      <div className="weekly-subtitle">
        최근 7일 동안 정상 자세로 유지된 시간을 요일별로 확인할 수 있습니다.
      </div>

      <div className="weekly-graph">
        <div className="graph-area">
          <div className="grid-lines">
            {graphAxisRows.map((tick, index) => (
              <div
                key={tick ?? "baseline"}
                className="grid-line-row"
                style={{
                  top: `${
                    (index / (graphAxisRows.length - 1)) * 100
                  }%`,
                }}
              />
            ))}
          </div>

          <div className="bars">
            {weeklyData.chart.map((day) => (
              <div className="bar-wrap" key={day.date}>
                {day.goodMinutes > 0 && (
                  <div
                    className="bar"
                    style={{
                      height: `${Math.min(
                        (day.goodMinutes / graphScale.maxMinutes) * 100,
                        100
                      )}%`,
                    }}
                  />
                )}
                <span className="x-label">{day.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="y-axis">
          {graphAxisRows.map((tick, index) => (
            <span
              key={tick ?? "baseline-label"}
              className={`y-axis-label ${tick === null ? "is-empty" : ""}`}
              style={{
                top: `${
                  (index / (graphAxisRows.length - 1)) * 100
                }%`,
              }}
            >
              {tick === null ? "" : formatGraphTick(tick)}
            </span>
          ))}
        </div>
      </div>

      <div className="weekly-summary-row">
        <img src="/images/line-md_arrow-up.png" className="arrow-img" alt="" />

        <div className="weekly-box">
          이번 주 평균 바른 자세 유지 시간은 <b>{averageGoodMinutes}분</b>
          입니다. <br />
          {weeklyData.peakUsageDay
            ? `${weeklyData.peakUsageDay.day}요일에 바른 자세 유지 시간이 가장 길었습니다.`
            : "아직 이번 주 사용 데이터가 없습니다."}
        </div>
      </div>
    </div>
  );
}

function StretchReport({ stretchLevel, displayName }) {
  return (
    <div className="stretch-report">
      <div className="stretch-title">단계별 스트레칭 추천</div>

      <div className="stretch-level-box">
        <div>{displayName} 님의 자세 등급</div>
        <div className="stretch-badge">{stretchLevel}단계</div>
      </div>

      {[1, 2, 3].map((level) => (
        <div
          key={level}
          className={`stretch-row ${stretchLevel === level ? "active" : ""}`}
        >
          <div className="stretch-row-title">{level}단계</div>

          <div className="stretch-card-wrap">
            {STRETCH_RECOMMENDATIONS[level].map((item) => (
              <div
                key={item.title}
                className={`stretch-card ${
                  stretchLevel === level ? "active" : ""
                }`}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="stretch-card-image"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SnapshotGallery({
  snapshotItems,
  snapshotConsent,
  onGoToMyPage,
  isDeleteMode,
  selectedSnapshotIds,
  onToggleDeleteMode,
  onSnapshotClick,
  onSelectAll,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  activeSnapshot,
  onClosePreview,
  toastMessage,
  isDeleteConfirmOpen,
}) {
  const allSelected =
    snapshotItems.length > 0 && selectedSnapshotIds.length === snapshotItems.length;
  if (snapshotConsent === false) {
    return (
      <div className="snapshot-gallery-report blocked">
        <div className="snapshot-gallery-title">스냅샷 갤러리</div>
        <div className="snapshot-gallery-description blocked-description">
          자세 분석 중 저장된 스냅샷을 한눈에 확인할 수 있습니다.
          <br />
          저장된 이미지는 분석 기록 확인 목적으로만 사용되며, 필요 시 삭제할 수 있습니다.
        </div>

        <div className="snapshot-blocked-card">
          <div className="snapshot-blocked-title">스냅샷을 불러올 수 없어요</div>
          <div className="snapshot-blocked-description">
            현재 스냅샷 갤러리 연동이 꺼져 있어요.
            <br />
            마이페이지에서 연동을 켜면 웹에서 저장된 자세 스냅샷을 확인할 수
            있어요.
          </div>
          <button
            type="button"
            className="snapshot-blocked-btn"
            onClick={onGoToMyPage}
          >
            마이페이지로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`snapshot-gallery-report ${
        isDeleteMode ? "delete-mode" : ""
      }`}
    >
      <div className="snapshot-gallery-header">
        <div>
          <div className="snapshot-gallery-title">스냅샷 갤러리</div>
          {!isDeleteMode && (
            <div className="snapshot-gallery-description">
              자세 분석 중 저장된 스냅샷을 한눈에 확인할 수 있습니다.
              <br />
              저장된 이미지는 눌러서 더 자세히 확인하거나 삭제할 수 있습니다.
            </div>
          )}
        </div>

        <div className="snapshot-gallery-actions">
          {isDeleteMode && (
            <>
              <button
                type="button"
                className="snapshot-select-all-btn"
                onClick={onSelectAll}
              >
                {allSelected ? "선택 해제" : "전체 선택"}
              </button>
              <button
                type="button"
                className="snapshot-delete-btn"
                onClick={onRequestDelete}
              >
                <img src="/snap_img/Group 47 (1).png" alt="삭제하기" />
              </button>
            </>
          )}

          <button
            type="button"
            className="snapshot-trash-btn"
            onClick={onToggleDeleteMode}
            aria-label={isDeleteMode ? "삭제 모드 닫기" : "삭제 모드 열기"}
          >
            <img src="/snap_img/bi_trash-fill.png" alt="" />
          </button>
        </div>
      </div>

      <div className="snapshot-grid">
        {snapshotItems.map((item) => {
          const isSelected = selectedSnapshotIds.includes(item.id);

          return (
            <button
              type="button"
              key={item.id}
              className={`snapshot-card ${isSelected ? "selected" : ""}`}
              onClick={() => onSnapshotClick(item)}
              aria-label={`스냅샷 ${item.id}`}
            >
              <img
                src={toProfileImageUrl(item.image_path)}
                alt=""
                className="snapshot-image"
              />
            </button>
          );
        })}
      </div>

      {toastMessage && (
        <div className="snapshot-toast" role="status">
          {toastMessage}
        </div>
      )}

      {activeSnapshot && !isDeleteMode && (
        <div
          className="snapshot-preview-backdrop"
          role="presentation"
          onClick={onClosePreview}
        >
          <div
            className="snapshot-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="스냅샷 크게 보기"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="snapshot-preview-close"
              aria-label="닫기"
              onClick={onClosePreview}
            >
              x
            </button>
            <img
              src={toProfileImageUrl(activeSnapshot.image_path)}
              alt=""
              className="snapshot-preview-image"
            />
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="snapshot-confirm-backdrop" role="presentation">
          <div
            className="snapshot-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="snapshot-confirm-title"
          >
            <div id="snapshot-confirm-title" className="snapshot-confirm-title">
              삭제하시겠습니까?
            </div>
            <div className="snapshot-confirm-actions">
              <button
                type="button"
                className="snapshot-confirm-btn confirm"
                onClick={onConfirmDelete}
              >
                예
              </button>
              <button
                type="button"
                className="snapshot-confirm-btn cancel"
                onClick={onCancelDelete}
              >
                아니오
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardSummary;
