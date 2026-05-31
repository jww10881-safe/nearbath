document.addEventListener('DOMContentLoaded', () => {
    // --- 설정 ---
    // API 연동이 정상화되면 아래 변수를 false로 변경하세요.
    const useMockData = true;
    const API_KEY = 'a30f91c128600f0935b421b583b0102300e96384e6a45ae868ecf9a643c014e9';
    const API_URL = 'https://apis.data.go.kr/1741000/public_restroom_info/info';
    
    // 광주광역시청 기본 좌표
    const defaultLocation = [35.1595, 126.8526];
    
    // --- 지도 초기화 ---
    const map = L.map('map', {
        zoomControl: false // UI 커스텀을 위해 기본 줌 컨트롤 숨김
    }).setView(defaultLocation, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // --- DOM 요소 ---
    const regionScreen = document.getElementById('region-screen');
    const mapContainer = document.getElementById('map');
    const mapUi = document.getElementById('map-ui');
    const backBtn = document.getElementById('back-btn');
    const regionBtns = document.querySelectorAll('.region-btn');
    const quickLocationBtn = document.getElementById('quick-location-btn');

    // --- 마커 아이콘 생성 ---
    const customIcon = L.divIcon({
        className: 'custom-marker',
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path></svg>',
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });

    let markers = [];
    let globalRestroomData = []; // 데이터 보관용 전역 변수
    let currentLat = null;       // 사용자 현재 위도
    let currentLng = null;       // 사용자 현재 경도

    // --- UI 요소 ---
    const infoPanel = document.getElementById('info-panel');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const controls = document.querySelector('.controls');
    const myLocationBtn = document.getElementById('my-location-btn');
    const loadingOverlay = document.getElementById('loading');

    // --- 데이터 로드 함수 ---
    async function loadRestroomData() {
        loadingOverlay.classList.remove('hidden');
        
        try {
            const response = await fetch('national_data.json');
            const jsonArray = await response.json();
            
            // 압축된 배열 형태의 데이터를 객체 형태로 변환
            globalRestroomData = jsonArray.map(arr => ({
                name: arr[0],
                address: arr[1],
                time: arr[2],
                lat: arr[3],
                lng: arr[4]
            }));
            
            renderMarkers(globalRestroomData);
            
        } catch (error) {
            console.error("데이터 로드 실패:", error);
            alert("전국 화장실 데이터를 불러오는 데 실패했습니다.");
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }

    // --- 마커 렌더링 함수 ---
    function renderMarkers(data) {
        // 기존 마커 모두 제거
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        
        if (!data || data.length === 0) return;

        // 현재 지도에 보이는 화면(Viewport) 영역 가져오기
        const bounds = map.getBounds();
        let renderedCount = 0;
        
        data.forEach(item => {
            if (renderedCount >= 200) return; // 렌더링 성능 보호: 화면 내 최대 200개까지만 표시
            
            const lat = parseFloat(item.REFINE_WGS84_LAT || item.lat);
            const lng = parseFloat(item.REFINE_WGS84_LOGT || item.lng || item.lon);
            
            if (isNaN(lat) || isNaN(lng)) return;
            
            // 화장실 좌표가 현재 지도 뷰포트 내에 있을 때만 마커 생성
            if (bounds.contains([lat, lng])) {
                const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
                
                // 마커 클릭 이벤트
                marker.on('click', () => {
                    showPanel(item);
                    infoPanel.classList.remove('hidden');
                    infoPanel.style.transform = 'translateY(0)';
                });
                
                markers.push(marker);
                renderedCount++;
            }
        });
    }

    // 지도를 드래그/확대/축소하여 이동이 끝났을 때 마커 새로고침
    map.on('moveend', () => {
        if (globalRestroomData && globalRestroomData.length > 0) {
            renderMarkers(globalRestroomData);
        }
    });

    // --- 패널 조작 함수 ---
    function showPanel(data, distance = null) {
        document.getElementById('restroom-name').textContent = data.PBCTLT_PLC_NM || data.name || '알 수 없음';
        document.getElementById('restroom-address').textContent = data.REFINE_ROADNM_ADDR || data.address || '주소 정보 없음';
        document.getElementById('restroom-time').textContent = data.OPEN_TM_INFO || data.openTime || data.time || '상시 개방(추정)';
        
        // 거리 표시 로직
        const distanceRow = document.getElementById('distance-row');
        if (distance !== null) {
            distanceRow.style.display = 'flex';
            const distText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : Math.round(distance) + 'm';
            document.getElementById('restroom-distance').textContent = `내 위치에서 약 ${distText}`;
        } else {
            distanceRow.style.display = 'none';
        }
        
        const isUnisex = (data.MALE_FEMALE_CMNUSE_TOILET_YN === 'Y');
        const hasCctv = (data.CCTV_INSTL_YN === 'Y');
        
        document.getElementById('badge-unisex').style.display = isUnisex ? 'inline-block' : 'none';
        document.getElementById('badge-cctv').style.display = hasCctv ? 'inline-block' : 'none';

        // 네비게이션 길찾기 버튼 로직
        const lat = parseFloat(data.REFINE_WGS84_LAT || data.lat);
        const lng = parseFloat(data.REFINE_WGS84_LOGT || data.lng || data.lon);
        const name = encodeURIComponent(data.PBCTLT_PLC_NM || data.name || '공중화장실');
        
        const navBtn = document.getElementById('nav-btn');
        if (navBtn) {
            navBtn.onclick = () => {
                if (currentLat && currentLng) {
                    // 현재 위치가 파악된 경우: 네이버 지도 길찾기 (출발지: 현위치, 도착지: 화장실)
                    window.open(`https://map.naver.com/v5/directions/${currentLng},${currentLat},내위치,,/${lng},${lat},${name},,/`, '_blank');
                } else {
                    // 현재 위치를 모르는 경우: 카카오맵 도착지 지정 (모바일에서는 자동으로 현위치 출발로 잡힘)
                    window.open(`https://map.kakao.com/link/to/${name},${lat},${lng}`, '_blank');
                }
            };
        }
        
        infoPanel.classList.remove('hidden');
        controls.classList.add('panel-active');
    }

    function hidePanel() {
        infoPanel.classList.add('hidden');
        controls.classList.remove('panel-active');
    }

    // --- 유틸 함수 ---
    function showLoading(show) {
        if (show) {
            loadingOverlay.classList.remove('hidden');
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const p1 = lat1 * Math.PI/180;
        const p2 = lat2 * Math.PI/180;
        const dp = (lat2-lat1) * Math.PI/180;
        const dl = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(dp/2) * Math.sin(dp/2) +
                  Math.cos(p1) * Math.cos(p2) *
                  Math.sin(dl/2) * Math.sin(dl/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function locateUser() {
        if (!navigator.geolocation) {
            alert("브라우저가 위치 정보를 지원하지 않습니다.");
            return;
        }
        
        myLocationBtn.classList.add('locating');
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                // 전역 변수에 현재 위치 저장
                currentLat = lat;
                currentLng = lng;
                
                map.flyTo([lat, lng], 15, { duration: 1 });
                
                // 내 위치 표시 (파란 점)
                L.circleMarker([lat, lng], {
                    radius: 8,
                    fillColor: "#3B82F6",
                    color: "#FFFFFF",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1
                }).addTo(map);
                
                myLocationBtn.classList.remove('locating');

                // 내 위치 기반 가장 가까운 화장실 찾기
                if (globalRestroomData && globalRestroomData.length > 0) {
                    let nearest = null;
                    let minDist = Infinity;
                    
                    globalRestroomData.forEach(item => {
                        const rLat = parseFloat(item.REFINE_WGS84_LAT || item.lat);
                        const rLng = parseFloat(item.REFINE_WGS84_LOGT || item.lng || item.lon);
                        if (isNaN(rLat) || isNaN(rLng)) return;
                        
                        const dist = getDistance(lat, lng, rLat, rLng);
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = item;
                        }
                    });
                    
                    if (nearest) {
                        // 약간 딜레이 후 팝업 띄움 (지도 이동 효과 고려)
                        setTimeout(() => {
                            showPanel(nearest, minDist);
                        }, 800);
                    }
                }
            },
            (error) => {
                console.error("위치 에러:", error);
                alert("위치 정보를 가져올 수 없습니다. 권한을 허용했는지 확인해주세요.");
                myLocationBtn.classList.remove('locating');
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }

    // --- 이벤트 리스너 ---
    closePanelBtn.addEventListener('click', hidePanel);
    map.on('click', hidePanel); // 맵 클릭 시 패널 닫기
    myLocationBtn.addEventListener('click', locateUser);
    
    // 지역 선택 버튼 클릭
    regionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const lat = parseFloat(btn.getAttribute('data-lat'));
            const lng = parseFloat(btn.getAttribute('data-lng'));
            
            // 화면 전환
            regionScreen.classList.add('hidden');
            mapContainer.classList.remove('hidden');
            mapUi.classList.remove('hidden');
            
            // 지도 크기 재계산 (숨겨져 있다가 나타날 때 필요)
            map.invalidateSize();
            map.setView([lat, lng], 14);
        });
    });

    // 내 주변 찾기 퀵 버튼 클릭
    quickLocationBtn.addEventListener('click', () => {
        // 화면 전환
        regionScreen.classList.add('hidden');
        mapContainer.classList.remove('hidden');
        mapUi.classList.remove('hidden');
        
        map.invalidateSize();
        // 위치 추적 함수 호출
        locateUser();
    });

    // 뒤로가기 버튼 클릭
    backBtn.addEventListener('click', () => {
        regionScreen.classList.remove('hidden');
        mapContainer.classList.add('hidden');
        mapUi.classList.add('hidden');
        hidePanel();
    });

    // --- 앱 시작 ---
    loadRestroomData();
});
