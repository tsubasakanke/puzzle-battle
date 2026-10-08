// Firebase コンソールの「プロジェクトの設定 → マイアプリ」で出てくる値。
// 公開しても問題ない値（データはセキュリティルール database.rules.json で守る）。未設定なら null にする。
export const firebaseConfig: Record<string, string> | null = {
  apiKey: 'AIzaSyD71nrI5YgNo-suyG04F8J9RRFMFJWDWjY',
  authDomain: 'puzbattle.firebaseapp.com',
  databaseURL: 'https://puzbattle-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'puzbattle',
  appId: '1:662102090740:web:34ee59cce863d7bd7f4fa1',
};
