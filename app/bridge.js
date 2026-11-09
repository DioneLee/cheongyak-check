// 청약 체크 앱(Capacitor) 전용 — sync-web.mjs 가 앱 화면(www/index.html) 맨 앞에만 넣는다. 웹사이트에는 없다.
// 하는 일 5가지 (모두 앱일 때만):
//  1) 저장 한 벌 더: cheongyak-check-v1 을 Capacitor Preferences 에도 저장 · 앱을 열 때 localStorage 가 비었으면 거기서 되살림
//  2) 공고 피드 오프라인: 마지막으로 받은 feed/notices.json 을 기억했다가 인터넷이 안 되면 그걸로
//  3) 관심 공고(★) 마감 하루 전 오전 9시 로컬 알림 · 알림 허용은 처음 ★를 누를 때 묻는다
//  4) 파일 받기(.ics · 내보내기 JSON): WebView 는 blob 다운로드를 못 해서 → 앱 임시 폴더에 쓰고 공유 시트로
//  5) Android 뒤로 버튼으로 탭 되돌아가기
(() => {
  const C = window.Capacitor; if (!C?.isNativePlatform?.()) return;
  const P = C.Plugins, KEY = 'cheongyak-check-v1', STARS = 'cheongyak-check-stars', FEED = 'cheongyak-check-app-feed', ASKED = 'cheongyak-check-app-notif-asked';
  const ls = window.localStorage, setItem = Storage.prototype.setItem, get = k => { try { return ls.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { setItem.call(ls, k, v); } catch (e) {} };

  // 1) 저장 한 벌 더 — 되살리는 동안(restoring)에는 화면이 처음 만든 빈 상태를 백업하지 않는다
  let restoring = get(KEY) === null;
  P.Preferences.get({ key: KEY }).then(({ value }) => {
    if (restoring && value) { put(KEY, value); location.reload(); return; }
    restoring = false; const v = get(KEY); if (v) P.Preferences.set({ key: KEY, value: v });
  }).catch(() => { restoring = false; });
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this !== ls) return;
    if (k === KEY && !restoring) P.Preferences.set({ key: KEY, value: String(v) }).catch(() => {});
    if (k === STARS) onStars();
  };

  // 2) 공고 피드: 받으면 기억 · 못 받으면 기억해 둔 것
  const fetch0 = window.fetch.bind(window);
  let feed = null; try { feed = JSON.parse(get(FEED)); } catch (e) {}
  window.fetch = async (u, o) => {
    if (!/feed\/notices\.json/.test(String(u?.url ?? u))) return fetch0(u, o);
    try {
      const r = await fetch0(u, o);
      if (r.ok) { const t = await r.clone().text(); put(FEED, t); try { feed = JSON.parse(t); } catch (e) {} schedule(); }
      return r;
    } catch (e) {
      const t = get(FEED); if (t) { schedule(); return new Response(t, { headers: { 'Content-Type': 'application/json' } }); }
      throw e;
    }
  };

  // 3) 마감 하루 전 오전 9시 알림 (관심 공고만 · 마감일을 아는 공고만)
  //    정확한 알람 권한은 Android 매니페스트에서 뺐다 → isExactNotification:false (안 주면 예약할 때마다 플러그인이 설정 화면을 연다) · 9시 "쯤" 울림
  const stars = () => { try { return JSON.parse(get(STARS)) || []; } catch (e) { return []; } };
  let starN = stars().length;
  async function onStars() {
    const n = stars().length, grew = n > starN; starN = n;
    if (grew && !get(ASKED)) { put(ASKED, '1'); try { await P.LocalNotifications.requestPermissions(); } catch (e) {} }
    schedule();
  }
  const idOf = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 2000000000) + 1; };   // 알림 번호 = 공고 id 해시 (같은 공고는 같은 번호)
  const nameOf = t => (typeof shortTitle === 'function' ? shortTitle(t) : t);   // 화면 쪽 짧은 이름 함수 (있으면)
  // 알림 목록 만들기 (순수 함수 · check.py 가 window.__ccAlarms 로 확인)
  const alarms = (items, starred, now) => items.filter(i => starred.has(i.id) && !i.startOnly && /^\d{4}-\d\d-\d\d$/.test(i.to || '')).map(i => {
    const [y, m, d] = i.to.split('-').map(Number);
    return { id: idOf(i.id), title: '내일 마감 · 청약 체크', body: `${nameOf(i.title)} — 내일${i.time ? ` ${i.time}` : ''} 마감이에요. 공고 원문에서 확인하세요.`, schedule: { at: new Date(y, m - 1, d - 1, 9, 0, 0), allowWhileIdle: true }, isExactNotification: false, extra: { cc: 1, fid: i.id } };
  }).filter(a => a.schedule.at.getTime() > now);
  window.__ccAlarms = alarms;
  let busy = Promise.resolve();
  function schedule() {
    busy = busy.then(async () => {
      const LN = P.LocalNotifications; if (!feed?.items) return;
      if ((await LN.checkPermissions()).display !== 'granted') return;
      const old = (await LN.getPending()).notifications.filter(x => x.extra?.cc);
      if (old.length) await LN.cancel({ notifications: old.map(x => ({ id: x.id })) });
      const list = alarms(feed.items, new Set(stars()), Date.now());
      if (list.length) await LN.schedule({ notifications: list });
    }).catch(e => console.warn('알림 예약 실패', e));
  }

  // 5) Android 뒤로 버튼: WebView 는 해시(탭) 이동을 뒤로 갈 기록으로 안 봐서 직접 — 공고 탭이면 앱 닫기, 아니면 이전 탭 (기록이 없으면 공고 탭)
  P.App?.addListener('backButton', () => {
    const h = location.hash; if (!h || h === '#notices') { P.App.exitApp(); return; }
    history.back(); setTimeout(() => { if (location.hash === h) location.replace('#notices'); }, 300);
  });

  // 4) 파일 받기 → 공유 시트 (취소해도 오류 아님)
  const click0 = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download || !this.href.startsWith('blob:')) return click0.call(this);
    const name = this.download.replace(/[\\/:*?"<>|]/g, '_');
    fetch0(this.href).then(r => r.text()).then(async data => {
      const { uri } = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, files: [uri] });
    }).catch(e => console.warn('파일 내보내기', e));
  };
})();
