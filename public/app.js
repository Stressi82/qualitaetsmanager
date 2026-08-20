(() => {
  'use strict';

  const BASE_QUESTIONS = Array.isArray(window.QUESTION_DATA) ? window.QUESTION_DATA : [];
  const STORE_KEY = 'qmb-lernplattform-v1';
  const APP_SCHEMA_VERSION = 21;
  const DATA_REVISION = 'qmb-gesamt-v11-0-36-chapters-qm-iso';
  const ACTIVE_IDLE_LIMIT_MS = 30_000;
  const TUTORIAL_VERSION = 1;
  const app = document.getElementById('app');
  let deferredInstall = null;
  let timerHandle = null;
  let videoGuideHandle = null;
  let fiveDayReviewTimer = null;
  let fiveDayReviewOpening = false;
  let tutorialTimer = null;
  let tutorialPreviousFocus = null;

  const EXAM_PRESETS = {
    full: {count: 45, minutes: 90, label: 'Vollprüfung'},
    mini10: {count: 5, minutes: 10, threshold: 60, label: 'Mini 10'},
    mini20: {count: 10, minutes: 20, threshold: 60, label: 'Mini 20'},
    mini30: {count: 15, minutes: 30, threshold: 60, label: 'Mini 30'}
  };

  const BACKGROUND_PRESETS = [
    {label: 'Tageslicht', color: '#cfe8cc'},
    {label: 'Tiefschwarz', color: '#030504'},
    {label: 'Waldgrün', color: '#07180f'},
    {label: 'Anthrazit', color: '#15191c'},
    {label: 'Nachtblau', color: '#081521'},
    {label: 'Petrol', color: '#071b1d'},
    {label: 'Aubergine', color: '#1a0e1b'}
  ];

  const QUESTION_SOURCE_TYPES = [
    {id: 'iso', label: 'ISO 9000 / ISO 9001'},
    {id: 'tuev-m1', label: 'TÜV Modul 1'},
    {id: 'tuev-m2', label: 'TÜV Modul 2'},
    {id: 'multiple', label: 'Mehrere Fachquellen'},
    {id: 'own', label: 'Eigene Unterlage oder Notiz'}
  ];

  const QUESTION_SOURCE_STATUSES = [
    {id: 'open', label: 'Offen – noch anhand der Quelle prüfen'},
    {id: 'verified', label: 'Geprüft – mit der eigenen Unterlage abgeglichen'},
    {id: 'limited', label: 'Begrenzt – nicht als sichere Lernpfadfrage verwenden'}
  ];

  const defaultStore = {
    theme: 'light',
    backgroundColor: '#cfe8cc',
    readableFont: false,
    highContrast: false,
    nightLevel: 0,
    wrongIds: [],
    stats: {},
    history: [],
    passThreshold: 70,
    customQuestions: [],
    overrides: {},
    archivedIds: [],
    customCategories: [],
    databaseUpdatedAt: null,
    databaseVersion: APP_SCHEMA_VERSION,
    dataRevision: DATA_REVISION,
    breakGameEnabled: true,
    breakAnsweredTotal: 0,
    breakEveryQuestions: 20,
    breakNextAt: 20,
    breakRotationIndex: 0,
    breakDurationMinutes: 3,
    activeSession: null,
    attemptLog: [],
    sessionHistory: [],
    learningPathProgress: {},
    learningPathLastModule: null,
    documentSearchSource: 'iso',
    openBookProgress: {},
    openBookHistory: [],
    openBookDifficulty: 'easy',
    openBookSavedAnswers: {},
    openBookHelpUsage: {},
    openBookReflections: {},
    pathHelpUsage: {},
    auditJourneyProgress: {},
    auditJourneyLastChapter: null,
    auditHelpUsage: {},
    videoGuideProgress: {},
    examDate: '',
    dailyQuestionGoal: 20,
    fiveDayReviewStartedAt: '',
    fiveDayReviewLastShownAt: '',
    tutorialCompletedVersion: 0,
    tutorialCompletedAt: ''
  };

  let store = loadStore();
  let state = {
    view: 'home',
    session: null,
    catalogQuery: '',
    catalogCategory: 'all',
    managerQuery: '',
    managerCategory: 'all',
    managerOrigin: 'all',
    editingUid: null,
    breakPrompt: null,
    game: null,
    pendingSession: null,
    openBookSource: null,
    openBookIndex: 0,
    openBookFeedback: null,
    openBookStartedAt: null,
    openBookHelpVisible: false,
    openBookDifficulty: 'easy',
    openBookPause: null,
    statsExamRange: 'all',
    statsCalendarOffset: 0,
    videoGuideId: 'lernpfad-1-qualitaet-abschnitt-1',
    videoGuideElapsed: 0,
    videoGuideScene: 0,
    videoGuidePlaying: false,
    videoGuideVoice: true,
    videoGuideLastTick: 0,
    videoGuideReturnView: 'videoGuides',
    tutorialActive: false,
    tutorialStep: 0
  };

  let appDialogResolver = null;
  let appDialogPreviousFocus = null;

  function ensureAppDialog() {
    let layer = document.getElementById('appDialog');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'appDialog';
    layer.className = 'app-dialog-layer';
    layer.hidden = true;
    layer.innerHTML = `<button class="app-dialog-backdrop" type="button" tabindex="-1" data-dialog-choice="cancel" aria-label="Dialog schließen"></button>
      <section class="app-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle" aria-describedby="appDialogMessage">
        <div class="app-dialog-symbol" id="appDialogSymbol" aria-hidden="true">?</div>
        <div class="app-dialog-copy"><div class="eyebrow" id="appDialogKicker">Qualitätsmanager Lernplattform</div><h2 id="appDialogTitle">Bitte bestätigen</h2><div class="app-dialog-message" id="appDialogMessage"></div></div>
        <div class="app-dialog-actions"><button class="secondary-btn" id="appDialogCancel" type="button" data-dialog-choice="cancel">Abbrechen</button><button class="primary-btn" id="appDialogConfirm" type="button" data-dialog-choice="confirm">Bestätigen</button></div>
      </section>`;
    layer.addEventListener('click', event => {
      const choice = event.target.closest('[data-dialog-choice]')?.dataset.dialogChoice;
      if (choice) closeAppDialog(choice === 'confirm');
    });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeAppDialog(false);
      }
      if (event.key === 'Tab') {
        const focusable = [...layer.querySelectorAll('button:not([hidden]):not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    document.body.appendChild(layer);
    return layer;
  }

  function closeAppDialog(result = false) {
    const layer = document.getElementById('appDialog');
    if (!layer || layer.hidden) return;
    layer.classList.remove('open');
    layer.hidden = true;
    document.body.classList.remove('app-dialog-open');
    const resolver = appDialogResolver;
    appDialogResolver = null;
    if (appDialogPreviousFocus?.isConnected) appDialogPreviousFocus.focus();
    appDialogPreviousFocus = null;
    if (resolver) resolver(Boolean(result));
  }

  function openAppDialog(message, options = {}) {
    const layer = ensureAppDialog();
    if (appDialogResolver) closeAppDialog(false);
    const infoOnly = options.type === 'info';
    appDialogPreviousFocus = document.activeElement;
    layer.querySelector('#appDialogKicker').textContent = options.kicker || 'Qualitätsmanager Lernplattform';
    layer.querySelector('#appDialogTitle').textContent = options.title || (infoOnly ? 'Hinweis' : 'Bitte bestätigen');
    const messageElement = layer.querySelector('#appDialogMessage');
    messageElement.className = `app-dialog-message${options.contentClass ? ` ${options.contentClass}` : ''}`;
    if (options.contentHtml) messageElement.innerHTML = options.contentHtml;
    else messageElement.textContent = String(message || '');
    layer.querySelector('#appDialogSymbol').textContent = options.symbol || (options.danger ? '!' : infoOnly ? 'i' : '?');
    const cancel = layer.querySelector('#appDialogCancel');
    const confirm = layer.querySelector('#appDialogConfirm');
    cancel.hidden = infoOnly;
    cancel.textContent = options.cancelLabel || 'Abbrechen';
    confirm.textContent = options.confirmLabel || (infoOnly ? 'Verstanden' : 'Bestätigen');
    confirm.className = options.danger ? 'danger-btn' : 'primary-btn';
    layer.classList.toggle('danger', Boolean(options.danger));
    layer.classList.toggle('wide', Boolean(options.wide));
    layer.hidden = false;
    layer.classList.add('open');
    document.body.classList.add('app-dialog-open');
    window.setTimeout(() => {
      const preferred = options.focusSelector ? layer.querySelector(options.focusSelector) : null;
      (preferred || (infoOnly ? confirm : cancel)).focus();
    }, 0);
    return new Promise(resolve => { appDialogResolver = resolve; });
  }

  function appConfirm(message, options = {}) {
    return openAppDialog(message, {...options, type: 'confirm'});
  }

  function appAlert(message, options = {}) {
    return openAppDialog(message, {...options, type: 'info'});
  }

  const VIDEO_GUIDES = [
    {
      id: 'lernpfad-1-qualitaet-abschnitt-1', moduleId:'grundlagen', number:1, duration:90,
      chapter: 'Lernpfad 1 · Qualität verstehen', section: 'Kurzvideo 1', title: 'Was bedeutet Qualität?',
      summary:'Merkmale, Anforderungen und ein erstes CARAT-Praxisbeispiel.',
      topics:['Qualitätsbegriff','Merkmale und Anforderungen','Quellen von Anforderungen','Qualitätsmerkmale am Produkt'],
      source: 'Begriffslogik nach DIN EN ISO 9000:2015, Abschnitt 3.6.2',
      sourceNote:'Das Beispiel überträgt die Begriffslogik auf CARAT Landfrische.',
      scenes: [
        {start:0,end:8,visual:'intro',kicker:'Lernpfad 1 · Kurzvideo 1',title:'Was bedeutet Qualität?',caption:'Qualität beginnt nicht mit Kontrolle. Sie beginnt mit einer klaren Anforderung.',narration:'Willkommen in Lernpfad eins: Qualität verstehen. Wir klären zuerst die entscheidende Frage: Was bedeutet Qualität?'},
        {start:8,end:21,visual:'compare',kicker:'Der erste Denkfehler',title:'Gut aussehen reicht nicht',caption:'Zwei Produkte können gleich aussehen – und trotzdem unterschiedliche Anforderungen erfüllen.',narration:'Stell dir zwei Lieferungen Tiefkühlbrokkoli vor. Beide sehen auf den ersten Blick gut aus. Trotzdem kann eine Lieferung qualitativ mangelhaft sein, zum Beispiel weil die Temperatur nicht eingehalten wurde.'},
        {start:21,end:36,visual:'definition',kicker:'Die Grundidee',title:'Merkmale treffen auf Anforderungen',caption:'Qualität beschreibt, wie gut vorhandene Merkmale die festgelegten Anforderungen erfüllen.',narration:'Qualität bedeutet nicht automatisch teuer, luxuriös oder besonders schön. Entscheidend ist, wie gut die Merkmale eines Produkts oder einer Dienstleistung die festgelegten Anforderungen erfüllen.'},
        {start:36,end:52,visual:'requirements',kicker:'Woher kommen Anforderungen?',title:'Nicht nur vom Kunden',caption:'Kundenanforderungen, rechtliche Vorgaben und eigene Festlegungen wirken zusammen.',narration:'Anforderungen kommen aus mehreren Richtungen. Der Kunde erwartet eine vereinbarte Leistung. Gesetze und Behörden verlangen Sicherheit. Und das Unternehmen legt eigene Standards für Prozesse und Ergebnisse fest.'},
        {start:52,end:70,visual:'carat',kicker:'Praxisbeispiel CARAT',title:'Brokkoli mit klaren Qualitätsmerkmalen',caption:'Temperatur, Schnittgröße, Sauberkeit und Liefertermin müssen gemeinsam stimmen.',narration:'Bei CARAT Landfrische kann Qualität deshalb heißen: richtige Temperatur, vereinbarte Schnittgröße, keine Verunreinigung und pünktliche Lieferung. Schon eine deutliche Abweichung kann bedeuten, dass die Anforderungen nicht vollständig erfüllt sind.'},
        {start:70,end:82,visual:'system',kicker:'Was macht Qualitätsmanagement?',title:'Anforderungen beherrschbar machen',caption:'Festlegen → umsetzen → prüfen → aus Abweichungen verbessern.',narration:'Qualitätsmanagement macht diese Anforderungen beherrschbar. Es legt Abläufe fest, sorgt für ihre Umsetzung, prüft Ergebnisse und nutzt Abweichungen, um Prozesse gezielt zu verbessern.'},
        {start:82,end:90,visual:'recap',kicker:'Merksatz',title:'Qualität ist erfüllte Anforderung',caption:'Frage dich immer: Welche Anforderung gilt – und woran erkenne ich ihre Erfüllung?',narration:'Merke dir: Qualität ist erfüllte Anforderung. Frage zuerst: Welche Anforderung gilt, und woran erkennst du ihre Erfüllung?'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-2', moduleId:'grundlagen', number:2, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 2', title:'Wer trägt Verantwortung für Qualität?',
      summary:'Rollen von Leitung, Prozessverantwortlichen, Mitarbeitenden und QMB.',
      topics:['Leitungsverantwortung','Prozessverantwortung','Rolle der Mitarbeitenden','Rolle des QMB'],
      source:'DIN EN ISO 9001:2015, Abschnitte 5.1.1, 5.3 und 7.3',
      sourceNote:'Das CARAT-Beispiel zeigt das Zusammenspiel der Rollen bei einer Temperaturabweichung.',
      scenes:[
        {start:0,end:8,visual:'responsibility-intro',kicker:'Lernpfad 1 · Kurzvideo 2',title:'Wer macht eigentlich Qualität?',caption:'Qualität entsteht nicht an einem einzelnen Schreibtisch.',narration:'Im zweiten Kurzvideo klären wir eine häufige Fehlannahme: Wer ist im Unternehmen eigentlich für Qualität verantwortlich?'},
        {start:8,end:22,visual:'quality-myth',kicker:'Der verbreitete Irrtum',title:'Der QMB macht nicht allein die Qualität',caption:'Ein Qualitätsbeauftragter kann das System unterstützen – aber nicht jede tägliche Arbeit übernehmen.',narration:'Oft heißt es: Dafür haben wir doch den QMB. Das greift zu kurz. Ein Qualitätsbeauftragter kann koordinieren und unterstützen, aber Qualität nicht stellvertretend für alle herstellen.'},
        {start:22,end:38,visual:'quality-leadership',kicker:'Rolle der Leitung',title:'Richtung, Verantwortung und Ressourcen',caption:'Die oberste Leitung bleibt für die Wirksamkeit des Qualitätsmanagementsystems rechenschaftspflichtig.',narration:'Die oberste Leitung gibt Richtung und Qualitätsziele vor. Sie muss Verantwortlichkeiten klären, geeignete Ressourcen bereitstellen und dafür sorgen, dass das Qualitätsmanagement in die Geschäftsprozesse eingebunden ist.'},
        {start:38,end:53,visual:'quality-process',kicker:'Rolle der Prozessverantwortlichen',title:'Anforderungen in Abläufe übersetzen',caption:'Prozessverantwortliche machen aus Vorgaben klare Arbeitsschritte und Kennzahlen.',narration:'Prozessverantwortliche übersetzen Anforderungen in beherrschbare Abläufe. Sie legen Zuständigkeiten, Prüfungen und Kennzahlen fest und reagieren, wenn der Prozess vom geplanten Ergebnis abweicht.'},
        {start:53,end:67,visual:'quality-employee',kicker:'Rolle der Mitarbeitenden',title:'Richtig arbeiten und Abweichungen melden',caption:'Wer den Prozess täglich ausführt, erkennt Veränderungen oft zuerst.',narration:'Mitarbeitende setzen die festgelegten Schritte um, führen Kontrollen durch und melden Abweichungen frühzeitig. Dafür müssen sie Anforderungen und Folgen ihres eigenen Handelns verstehen.'},
        {start:67,end:82,visual:'quality-qmb',kicker:'Rolle des QMB',title:'Verbinden, sichtbar machen, verbessern',caption:'Der QMB unterstützt das System, bringt Informationen zusammen und fördert Verbesserungen.',narration:'Der QMB verbindet die Bereiche, begleitet Audits, macht Ergebnisse sichtbar und unterstützt Verbesserungen. Er schafft Orientierung, nimmt den anderen Rollen ihre Verantwortung aber nicht ab.'},
        {start:82,end:90,visual:'team-recap',kicker:'CARAT-Merksatz',title:'Qualität ist Teamarbeit',caption:'Leitung ermöglicht. Prozesse steuern. Mitarbeitende handeln. Der QMB verbindet.',narration:'Merke dir: Qualität entsteht dort, wo gearbeitet wird. Die Leitung ermöglicht, jeder Bereich handelt, und der QMB verbindet das System.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-3', moduleId:'grundlagen', number:3, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 3', title:'Korrektur oder Korrekturmaßnahme?',
      summary:'Sofortige Fehlerbehebung klar von nachhaltiger Ursachenbeseitigung unterscheiden.',
      topics:['Korrektur','Ursachenanalyse','Korrekturmaßnahme','Wirksamkeitsprüfung'],
      source:'DIN EN ISO 9000:2015, Abschnitte 3.12.2 und 3.12.3; DIN EN ISO 9001:2015, Abschnitt 10.2.1',
      sourceNote:'Das neue CARAT-Beispiel trennt die Bearbeitung einer falsch etikettierten Charge von der Beseitigung ihrer Ursache.',
      scenes:[
        {start:0,end:8,visual:'correction-intro',kicker:'Lernpfad 1 · Kurzvideo 3',title:'Korrektur oder Korrekturmaßnahme?',caption:'Zwei ähnliche Wörter – aber zwei verschiedene Aufgaben.',narration:'Im dritten Kurzvideo unterscheiden wir zwei Begriffe, die in Prüfungen leicht verwechselt werden: Korrektur und Korrekturmaßnahme.'},
        {start:8,end:21,visual:'label-mixup',kicker:'Neuer CARAT-Fall',title:'Mango mit falschem Etikett',caption:'Auf einer Charge Tiefkühlmango befindet sich versehentlich das Etikett für Erdbeeren.',narration:'Bei CARAT tragen Packungen Tiefkühlmango versehentlich das Etikett für Erdbeeren. Die betroffene Charge wird sofort gestoppt und gesichert.'},
        {start:21,end:34,visual:'correction-fix',kicker:'Schritt 1 · Korrektur',title:'Den erkannten Fehler beseitigen',caption:'Falsche Etiketten entfernen, Ware korrekt kennzeichnen und die Charge kontrollieren.',narration:'Die falschen Etiketten werden entfernt und die Packungen korrekt neu gekennzeichnet. Das ist eine Korrektur: Sie beseitigt die erkannte Nichtkonformität.'},
        {start:34,end:47,visual:'correction-limit',kicker:'Die Grenze der Korrektur',title:'Der aktuelle Fall ist erledigt – die Ursache nicht',caption:'Ohne Ursachenklärung kann dieselbe Etikettenverwechslung erneut auftreten.',narration:'Damit ist das aktuelle Problem behoben. Doch wenn niemand untersucht, warum das falsche Etikett verwendet wurde, kann derselbe Fehler morgen wieder auftreten.'},
        {start:47,end:62,visual:'root-cause',kicker:'Schritt 2 · Ursache untersuchen',title:'Warum konnte die Verwechslung entstehen?',caption:'Fast gleiche Dateinamen und eine fehlende Druckfreigabe werden als Ursache erkannt.',narration:'Nun wird die Ursache analysiert. Zum Beispiel waren zwei Etikettendateien fast gleich benannt, und vor dem Druck fehlte eine eindeutige Freigabe.'},
        {start:62,end:78,visual:'corrective-action',kicker:'Schritt 3 · Korrekturmaßnahme',title:'Die Ursache dauerhaft beseitigen',caption:'Eindeutige Dateicodes und ein Barcode-Abgleich verhindern die gleiche Verwechslung.',narration:'Dateien werden eindeutig codiert, und der Druck startet erst nach einem Barcode-Abgleich. Diese Korrekturmaßnahme beseitigt die Ursache und soll eine Wiederholung verhindern.'},
        {start:78,end:90,visual:'correction-recap',kicker:'Schritt 4 · Wirksamkeit prüfen',title:'Ist der Fehler wirklich verschwunden?',caption:'Weitere Chargen beobachten und nachweisen, dass die Verwechslung nicht erneut auftritt.',narration:'Anschließend werden weitere Chargen geprüft. Bleibt die Verwechslung aus, war die Maßnahme wirksam. Merke: Korrektur behebt den Fall. Korrekturmaßnahme verhindert die Wiederholung.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-4', moduleId:'grundlagen', number:4, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 4', title:'Was kostet schlechte Qualität?',
      summary:'Sichtbare und versteckte Fehlerkosten sowie den wirtschaftlichen Nutzen des QM-Systems erkennen.',
      topics:['Fehlerkosten','Interne und externe Kostenfolgen','Prozessverschwendung','Wirtschaftlicher Nutzen des QM-Systems'],
      source:'TÜV Modul 1, Abschnitt 2.3.3 „Nutzen eines Qualitätsmanagementsystems“; TÜV Modul 2, Hinweis zur Qualitätskostenanalyse',
      sourceNote:'Das neue CARAT-Beispiel vergleicht die frühe Erkennung einer undichten Schweißnaht mit einer späteren Reklamation beim Großkunden.',
      scenes:[
        {start:0,end:8,visual:'cost-intro',kicker:'Lernpfad 1 · Kurzvideo 4',title:'Was kostet schlechte Qualität?',caption:'Ein Fehler verbraucht mehr als nur ein fehlerhaftes Produkt.',narration:'Das vierte Kurzvideo zeigt eine oft unterschätzte Seite von Qualität: Schlechte Qualität verbraucht Zeit, Material und Geld.'},
        {start:8,end:21,visual:'cost-iceberg',kicker:'Die versteckte Rechnung',title:'Der sichtbare Fehler ist nur die Spitze',caption:'Hinter einem Defekt verbergen sich viele zusätzliche Tätigkeiten und Verluste.',narration:'Sichtbar ist vielleicht nur ein defekter Beutel. Dahinter stehen Suchzeit, Stillstand, zusätzliche Prüfung, Nacharbeit und verlorenes Material.'},
        {start:21,end:35,visual:'internal-costs',kicker:'Im Unternehmen entdeckt',title:'Interne Fehlerkosten',caption:'Sperren, nacharbeiten, erneut prüfen und Verzögerungen auffangen.',narration:'Wird eine undichte Schweißnaht noch bei CARAT entdeckt, entstehen interne Fehlerkosten: Ware sperren, Verpackung austauschen, erneut prüfen und den Ablauf verzögern.'},
        {start:35,end:50,visual:'external-costs',kicker:'Beim Kunden entdeckt',title:'Externe Fehlerkosten',caption:'Außerhalb des Unternehmens wird derselbe Fehler meist deutlich aufwendiger.',narration:'Erreicht der Beutel bereits den Großkunden, kommen Rücktransport, Ersatzlieferung, Reklamationsbearbeitung und möglicherweise Kulanz hinzu. Zusätzlich kann Vertrauen verloren gehen.'},
        {start:50,end:64,visual:'efficiency-savings',kicker:'Mehr als Fehler vermeiden',title:'Verschwendung aus Abläufen entfernen',caption:'Doppelarbeit, lange Durchlaufzeiten, Wartezeiten und unnötige Bestände binden Ressourcen.',narration:'Qualitätsmanagement spart nicht nur Fehlerkosten. Klare, einfache Abläufe vermeiden Doppelarbeit, verkürzen Durchlaufzeiten und können unnötige Bestände oder Wartezeiten reduzieren.'},
        {start:64,end:79,visual:'quality-investment',kicker:'Prüfen kostet – Fehler auch',title:'Planbarer Aufwand statt teurer Überraschung',caption:'Eine gezielte Prüfung benötigt Zeit, begrenzt aber ein wesentlich größeres Kostenrisiko.',narration:'Eine regelmäßige Nahtprüfung kostet ebenfalls Zeit. Sie ist jedoch planbar und meist günstiger als der Aufwand, wenn ein ganzer Auftrag zurückkommt.'},
        {start:79,end:90,visual:'cost-recap',kicker:'Wirtschaftlicher Merksatz',title:'Nicht nur Kosten sehen – vermiedene Verluste sehen',caption:'Der Nutzen des QM-Systems zeigt sich auch in Zeit, Material, Durchlaufzeit und Kundenbindung.',narration:'Merke: Entscheidend ist nicht nur, was Qualitätsmanagement kostet, sondern welche Verschwendung es verhindert. Schlechte Qualität erscheint oft erst später auf der Rechnung.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-5', moduleId:'grundlagen', number:5, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 5', title:'Warum erfüllt nicht gleich begeistert?',
      summary:'Das Kano-Modell mit Basis-, Leistungs- und Begeisterungsmerkmalen verständlich anwenden.',
      topics:['Kano-Modell','Basismerkmale','Leistungsmerkmale','Begeisterungsmerkmale','Gewöhnungseffekt'],
      source:'TÜV Modul 1, Abschnitt 2.1.3 „Systematisierung von Kundenanforderungen“',
      sourceNote:'Das neue CARAT-Beispiel zeigt unterschiedliche Zufriedenheitswirkungen anhand intakter Ware, flexibler Gebindegrößen und digitaler Herkunftsnachweise.',
      scenes:[
        {start:0,end:8,visual:'kano-intro',kicker:'Lernpfad 1 · Kurzvideo 5',title:'Warum erfüllt nicht gleich begeistert?',caption:'Ein Merkmal kann Unzufriedenheit verhindern, Zufriedenheit steigern oder positiv überraschen.',narration:'Das fünfte Kurzvideo erklärt, warum dieselbe Leistung Kunden enttäuschen, zufriedenstellen oder sogar begeistern kann.'},
        {start:8,end:21,visual:'kano-axis',kicker:'Das Kano-Modell',title:'Erfüllung wirkt unterschiedlich',caption:'Nicht jedes Produkt- oder Dienstleistungsmerkmal verändert die Zufriedenheit auf dieselbe Weise.',narration:'Das Kano-Modell ordnet Merkmale danach, wie ihre Erfüllung die Zufriedenheit beeinflusst. Entscheidend ist nicht nur, ob etwas vorhanden ist, sondern wie der Kunde es erwartet.'},
        {start:21,end:35,visual:'kano-basic',kicker:'Kategorie 1',title:'Basismerkmale',caption:'Selbstverständlich erwartet: Fehlen macht unzufrieden, Erfüllung wird kaum besonders wahrgenommen.',narration:'Basismerkmale gelten als selbstverständlich. Bei CARAT erwartet der Großkunde vollständige, unbeschädigte Ware. Fehlt das, ist er unzufrieden; stimmt alles, bleibt er meist nur neutral.'},
        {start:35,end:50,visual:'kano-performance',kicker:'Kategorie 2',title:'Leistungsmerkmale',caption:'Je besser die bewusst gewünschte Leistung erfüllt wird, desto höher steigt die Zufriedenheit.',narration:'Leistungsmerkmale werden bewusst verglichen. Beispielsweise kann der Kunde flexible Gebindegrößen wählen. Je besser dieser Wunsch erfüllt wird, desto stärker wächst seine Zufriedenheit.'},
        {start:50,end:65,visual:'kano-delight',kicker:'Kategorie 3',title:'Begeisterungsmerkmale',caption:'Nicht erwartet, nicht verlangt – aber mit erkennbarem Zusatznutzen.',narration:'Begeisterungsmerkmale sind unerwartete Zusatznutzen. Ein QR-Code liefert sofort Herkunft, Erntedatum und aktuelle Nachweise, obwohl der Kunde das nicht verlangt hat. Das kann positiv überraschen.'},
        {start:65,end:79,visual:'kano-shift',kicker:'Der Gewöhnungseffekt',title:'Begeisterung kann zum Standard werden',caption:'Was heute überrascht, kann morgen erwartet und später selbstverständlich sein.',narration:'Doch Begeisterung hält nicht automatisch. Wird der digitale Nachweis üblich, erwartet der Kunde ihn irgendwann. Ein früheres Begeisterungsmerkmal kann zum Leistungs- und später zum Basismerkmal werden.'},
        {start:79,end:90,visual:'kano-recap',kicker:'Kano-Merksatz',title:'Drei Wirkungen sauber unterscheiden',caption:'Basis verhindert Unzufriedenheit · Leistung steigert Zufriedenheit · Begeisterung überrascht positiv.',narration:'Merke: Basis verhindert Unzufriedenheit. Leistung steigert Zufriedenheit. Begeisterung schafft Überraschung. Wer Erwartungen regelmäßig neu beobachtet, erkennt, wann sich ihre Wirkung verändert.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-6', moduleId:'grundlagen', number:6, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 6', title:'Wie wird Qualität eigentlich gemanagt?',
      summary:'Die Bausteine Qualitätspolitik, Ziele, Planung, Steuerung, Sicherung und Verbesserung unterscheiden.',
      topics:['Bestandteile des Qualitätsmanagements','Qualitätspolitik und Qualitätsziele','Qualitätsplanung und -steuerung','Qualitätssicherung','Qualitätsverbesserung'],
      source:'TÜV Modul 1, Abschnitt 2.1.4 „Qualitätsmanagement“',
      sourceNote:'Das CARAT-Beispiel ordnet die Vorbereitung einer neuen Tiefkühlmischung den verschiedenen Tätigkeiten des Qualitätsmanagements zu.',
      scenes:[
        {start:0,end:8,visual:'qm-toolbox-intro',kicker:'Lernpfad 1 · Kurzvideo 6',title:'Wie wird Qualität eigentlich gemanagt?',caption:'Qualitätsmanagement ist mehr als prüfen: Mehrere abgestimmte Tätigkeiten greifen ineinander.',narration:'Im sechsten Kurzvideo zerlegen wir Qualitätsmanagement in seine wichtigsten Bestandteile. So wird aus einem großen Begriff ein übersichtliches Arbeitsmodell.'},
        {start:8,end:21,visual:'qm-direction',kicker:'Richtung festlegen',title:'Qualitätspolitik und Qualitätsziele',caption:'Die Politik gibt die Richtung vor; konkrete Ziele machen diese Richtung für die Organisation greifbar.',narration:'Am Anfang steht die Richtung. Die Qualitätspolitik beschreibt den grundsätzlichen Anspruch der Organisation. Daraus werden konkrete Qualitätsziele abgeleitet, an denen sich Entscheidungen orientieren.'},
        {start:21,end:35,visual:'qm-planning',kicker:'Vorausdenken',title:'Qualitätsplanung',caption:'Vor dem Start werden Merkmale, Vorgehen, Mittel und Prüfpunkte für die gewünschte Leistung festgelegt.',narration:'CARAT plant eine neue Tiefkühlmischung. Noch vor dem ersten Produktionslauf werden Rezeptur, Temperaturgrenzen, benötigte Mittel und geeignete Prüfpunkte festgelegt. Das ist Qualitätsplanung.'},
        {start:35,end:49,visual:'qm-control',kicker:'Im Ablauf lenken',title:'Qualitätssteuerung',caption:'Aktuelle Werte werden beobachtet und bei Abweichungen wird der laufende Prozess angepasst.',narration:'Während der Herstellung werden Temperatur und Mischungsverhältnis beobachtet. Weicht ein Wert ab, wird der laufende Ablauf angepasst. Dieses operative Lenken gehört zur Qualitätssteuerung.'},
        {start:49,end:63,visual:'qm-assurance',kicker:'Vertrauen schaffen',title:'Qualitätssicherung',caption:'Festgelegte Verfahren und nachvollziehbare Nachweise geben Vertrauen in eine wiederholbar richtige Arbeitsweise.',narration:'Qualitätssicherung schafft Vertrauen, dass die festgelegte Arbeitsweise wiederholbar funktioniert. Freigegebene Verfahren, geeignete Prüfmittel und nachvollziehbare Aufzeichnungen dienen dafür als Nachweis.'},
        {start:63,end:78,visual:'qm-improvement',kicker:'Leistung weiterentwickeln',title:'Qualitätsverbesserung',caption:'Daten und Erfahrungen werden genutzt, um die Fähigkeit der Abläufe gezielt zu erhöhen.',narration:'Bei der Qualitätsverbesserung geht es nicht nur um einen einzelnen Defekt. Daten und Erfahrungen zeigen, wo ein Ablauf stabiler, einfacher oder leistungsfähiger gestaltet werden kann.'},
        {start:78,end:90,visual:'qm-components-recap',kicker:'QM-Merksatz',title:'Richtung geben, vorausdenken, lenken, sichern, verbessern',caption:'Erst das abgestimmte Zusammenspiel der Tätigkeiten macht Qualitätsmanagement wirksam.',narration:'Merke: Politik und Ziele geben die Richtung. Planung denkt voraus. Steuerung lenkt den Ablauf. Sicherung schafft Vertrauen. Verbesserung entwickelt die Leistungsfähigkeit weiter.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-7', moduleId:'grundlagen', number:7, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 7', title:'Wo entsteht Qualität?',
      summary:'Den systematischen Qualitätsansatz vom ersten Entwurf bis zur Betreuung nach der Lieferung verfolgen.',
      topics:['Systematischer Qualitätsansatz','Qualität in der Entwicklung','Vertrieb und Auftragsklärung','Machbarkeit und Leistungsvereinbarung','Kundenbetreuung und Service'],
      source:'TÜV Modul 1, Abschnitt 2.1.5 „Systematischer Qualitätsansatz“',
      sourceNote:'Die CARAT-Reise einer neuen Mango-Brokkoli-Mischung zeigt Qualität vor, während und nach der eigentlichen Herstellung.',
      scenes:[
        {start:0,end:8,visual:'chain-intro',kicker:'Lernpfad 1 · Kurzvideo 7',title:'Wo entsteht Qualität?',caption:'Die entscheidenden Weichen werden lange vor der Herstellung gestellt – und die Arbeit endet nicht an der Rampe.',narration:'Im siebten Kurzvideo begleiten wir eine Leistung durch das Unternehmen. Dabei wird sichtbar: Qualität entsteht weder nur an der Maschine noch erst bei der Endkontrolle.'},
        {start:8,end:21,visual:'chain-trap',kicker:'Zu eng gedacht',title:'Nur auf die Kernleistung zu schauen reicht nicht',caption:'Eine einwandfreie Produktion kann unzureichend sein, wenn Vorbereitung, Vereinbarung oder Betreuung nicht stimmen.',narration:'Die laufende Überwachung der Herstellung ist wichtig. Qualitätsmanagement darf sich jedoch nicht auf die Kernleistung beschränken. Auch das Davor und Danach prägen das Ergebnis für den Kunden.'},
        {start:21,end:34,visual:'chain-development',kicker:'Station 1',title:'Qualität beginnt in der Entwicklung',caption:'Spezifikationen und Standards legen fest, was die neue Leistung später können und einhalten soll.',narration:'Für eine neue Mango-Brokkoli-Mischung werden zuerst Rezeptur, Stückgrößen und Verpackungsanforderungen entwickelt. Diese frühen Festlegungen bilden die Grundlage für die spätere Leistung.'},
        {start:34,end:48,visual:'chain-sales',kicker:'Station 2',title:'Der Vertrieb klärt den tatsächlichen Bedarf',caption:'Kundenwünsche müssen verstanden, präzisiert und mit aktuellen Informationen beantwortet werden.',narration:'Der Vertrieb klärt, welche Gebindegröße, Menge und Lieferfolge der Großkunde wirklich benötigt. Eine ungenaue Anfrage darf nicht einfach als eindeutiger Auftrag behandelt werden.'},
        {start:48,end:62,visual:'chain-contract',kicker:'Station 3',title:'Machbarkeit prüfen und Leistung eindeutig vereinbaren',caption:'Erst prüfen, dann die zugesagte Leistung in Angebot oder Vertrag klar festhalten.',narration:'Anschließend prüft CARAT, ob Rohware, Anlage und Termin zur Anfrage passen. Erst nach dieser Machbarkeitsprüfung werden Menge, Ausführung und Liefertermin eindeutig vereinbart.'},
        {start:62,end:77,visual:'chain-service',kicker:'Station 4',title:'Nach der Lieferung geht Qualität weiter',caption:'Auftragsabwicklung, Kundenbetreuung und Service beeinflussen das Qualitätsniveau weiterhin.',narration:'Mit der Auslieferung endet die Qualitätserbringung nicht. Vollständige Lieferinformationen, eine erreichbare Betreuung und eine zügige Antwort auf Rückfragen gehören ebenfalls zur wahrgenommenen Leistung.'},
        {start:77,end:90,visual:'chain-recap',kicker:'Reise-Merksatz',title:'Qualität entsteht entlang des gesamten Leistungswegs',caption:'Entwicklung → Klärung → Machbarkeit → Vereinbarung → Erbringung → Betreuung.',narration:'Merke: Qualität ist eine Reise durch das Unternehmen. Entwicklung, Auftragsklärung, Machbarkeit, Vereinbarung, Erbringung und Betreuung leisten jeweils einen eigenen Beitrag zum Gesamtergebnis.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-8', moduleId:'grundlagen', number:8, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 8', title:'Wann wird aus Einzelteilen ein System?',
      summary:'Verstehen, wie zusammenwirkende Bereiche, Prozesse und Informationen erst gemeinsam ein Qualitätsmanagementsystem bilden.',
      topics:['Qualitätsmanagementsystem','Zusammenwirkende Elemente','Abteilungsübergreifende Wechselwirkungen','Schnittstellenkoordination','Systemleistung'],
      source:'TÜV Modul 1, Abschnitt 2.1.6 „Qualitätsmanagementsystem“; Begriffslogik nach ISO 9000',
      sourceNote:'Das CARAT-Beispiel zeigt eine geänderte Kartongröße, die nur bei funktionierenden Übergaben durchgängig umgesetzt wird.',
      scenes:[
        {start:0,end:8,visual:'qms-intro',kicker:'Lernpfad 1 · Kurzvideo 8',title:'Wann wird aus Einzelteilen ein System?',caption:'Viele gute Einzelbereiche ergeben noch nicht automatisch ein wirksames Qualitätsmanagementsystem.',narration:'Im achten Kurzvideo betrachten wir nicht einzelne Aufgaben, sondern ihre Verbindungen. Denn ein Qualitätsmanagementsystem lebt vom funktionierenden Zusammenspiel.'},
        {start:8,end:21,visual:'qms-parts',kicker:'Teile allein genügen nicht',title:'Ein System ist mehr als eine Sammlung',caption:'Abteilungen, Abläufe, Regeln und Informationen müssen sich gegenseitig sinnvoll unterstützen.',narration:'Ein Unternehmen besteht aus vielen Teilen. Einkauf, Herstellung, Lager und Vertrieb können für sich gut arbeiten. Ohne abgestimmte Beziehungen entsteht daraus aber noch kein funktionierendes Ganzes.'},
        {start:21,end:34,visual:'qms-links',kicker:'Die Verbindungen entscheiden',title:'Elemente beeinflussen sich gegenseitig',caption:'Eine Änderung an einer Stelle kann Auswirkungen auf mehrere nachfolgende Bereiche haben.',narration:'Zusammenwirkende Elemente beeinflussen einander. Ändert sich eine Kundenvorgabe, kann das Verpackung, Materialbedarf, Lagerung und Auslieferung gleichzeitig betreffen.'},
        {start:34,end:49,visual:'qms-carat-flow',kicker:'CARAT-Systemfall',title:'Eine neue Kartongröße wandert durch das Unternehmen',caption:'Vertrieb, Einkauf, Verpackung und Lager benötigen dieselbe freigegebene Information.',narration:'Ein Großkunde bestellt künftig eine andere Kartongröße. Der Vertrieb erfasst die Änderung. Einkauf, Verpackung und Lager müssen anschließend mit derselben freigegebenen Information weiterarbeiten.'},
        {start:49,end:64,visual:'qms-break',kicker:'Gestörte Wechselwirkung',title:'Ein schwacher Übergang beeinträchtigt das Ganze',caption:'Bleibt das alte Palettenmuster im Lager bestehen, passt der fertige Auftrag nicht in den geplanten Ablauf.',narration:'Erreicht die Änderung das Lager nicht, wird weiter mit dem alten Palettenmuster geplant. Obwohl einzelne Tätigkeiten korrekt ausgeführt wurden, kann sich die Lieferung verzögern.'},
        {start:64,end:78,visual:'qms-coordinate',kicker:'Gezielt koordinieren',title:'Gemeinsame Regeln für Übergabe und Rückmeldung',caption:'Freigabestatus, eindeutige Informationswege und Rückmeldungen verbinden die beteiligten Elemente.',narration:'Das Qualitätsmanagementsystem koordiniert solche Verbindungen. Ein eindeutiger Freigabestatus, festgelegte Übergaben und Rückmeldungen sorgen dafür, dass alle mit dem gleichen Stand arbeiten.'},
        {start:78,end:90,visual:'qms-recap',kicker:'System-Merksatz',title:'Nicht die Teile – ihr Zusammenspiel liefert die volle Leistung',caption:'Ein QMS ist kein einzelnes Dokument, sondern ein geordnetes Netz zusammenwirkender Elemente.',narration:'Merke: Ein Qualitätsmanagementsystem ist weder nur ein Ordner noch ein Zertifikat. Es ist das geordnete Zusammenspiel der Elemente, mit denen Qualität gemeinsam erreicht wird.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-9', moduleId:'grundlagen', number:9, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 9', title:'Wie wurde aus Kontrolle modernes Qualitätsmanagement?',
      summary:'Die Entwicklung vom nachträglichen Aussortieren über Vorbeugung bis zum integrierten Qualitätsmanagement verstehen.',
      topics:['Entwicklung des Qualitätsmanagements','Nachträgliche Qualitätskontrolle','Produktionsnahe Qualitätsprüfung','Übergang zur Fehlervermeidung','Integriertes Qualitätsmanagement und TQM'],
      source:'TÜV Modul 1, Abschnitt 2.2.1 „Entwicklung des Qualitätsmanagements“',
      sourceNote:'Die CARAT-Bildfolge überträgt die historischen Entwicklungsstufen auf eine fiktive Produktionslinie, ohne die bereits behandelte Fehlerkorrektur erneut zu erklären.',
      scenes:[
        {start:0,end:8,visual:'history-intro',kicker:'Lernpfad 1 · Kurzvideo 9',title:'Wie wurde aus Kontrolle modernes Qualitätsmanagement?',caption:'Der Blick auf Qualität wanderte Schritt für Schritt vom fertigen Produkt zum gesamten Unternehmen.',narration:'Im neunten Kurzvideo machen wir eine Zeitreise. Sie zeigt, wie sich der Anspruch von einfachem Aussortieren zu umfassendem Qualitätsmanagement entwickelt hat.'},
        {start:8,end:21,visual:'history-end-control',kicker:'Stufe 1 · sortierend',title:'Fehler erst am fertigen Produkt entdecken',caption:'Die Endkontrolle trennt brauchbare von unbrauchbarer Ware – nachdem Aufwand und Material bereits eingesetzt wurden.',narration:'Am Anfang stand die nachträgliche Qualitätskontrolle. Fertige Produkte wurden vollständig geprüft und ungeeignete Stücke aussortiert. Der Fehler wurde entdeckt, aber sehr spät.'},
        {start:21,end:35,visual:'history-in-process',kicker:'Stufe 2 · steuernd',title:'Prüfung rückt näher an die Herstellung',caption:'Teilprüfungen und Prozessbeobachtung machen Abweichungen bereits während der Produktion sichtbar.',narration:'Später wanderte die Prüfung in die Herstellung. Stichproben, Teilkontrollen und statistische Beobachtung ermöglichten es, Auffälligkeiten früher im Produktionsverlauf zu erkennen.'},
        {start:35,end:49,visual:'history-prevention',kicker:'Stufe 3 · vorbeugend',title:'Nicht nur entdecken – Entstehung vermeiden',caption:'Qualitätstechniken und geplante Sicherung werden in Abläufe eingebunden, bevor das Endprodukt betroffen ist.',narration:'Mit der Qualitätssicherung begann der Schritt zur Vorbeugung. Qualitätsbezogene Tätigkeiten wurden systematisch in bestehende Abläufe eingebunden, damit Probleme möglichst gar nicht erst entstehen.'},
        {start:49,end:63,visual:'history-integration',kicker:'Stufe 4 · integrierend',title:'Qualität wird zur unternehmensweiten Führungsaufgabe',caption:'Prozesse, Kundenbezug und fortlaufende Entwicklung werden gemeinsam betrachtet und durch Normen unterstützt.',narration:'Modernes Qualitätsmanagement integriert Planung und Lenkung in alle qualitätsrelevanten Unternehmensprozesse. Kundenbedürfnisse, kontinuierliche Entwicklung und ein systematischer Rahmen kommen zusammen.'},
        {start:63,end:78,visual:'history-tqm',kicker:'Nächste Reifestufe',title:'TQM erweitert den Blick',caption:'Umfassendes Qualitätsmanagement betrachtet langfristigen Erfolg sowie Nutzen für Kunden, Beschäftigte und Gesellschaft.',narration:'Total Quality Management erweitert diesen Gedanken. Qualität wird unternehmensweit verstanden und anhand ihres Reifegrades bewertet. Der Blick richtet sich auf nachhaltigen Erfolg und umfassenden Nutzen.'},
        {start:78,end:90,visual:'history-recap',kicker:'Entwicklungs-Merksatz',title:'Sortieren → steuern → vorbeugen → integrieren',caption:'Jede Stufe verlagert Aufmerksamkeit früher und erweitert zugleich den betrachteten Bereich.',narration:'Merke: Die Entwicklung führt vom Sortieren über produktionsnahes Steuern und Vorbeugen bis zum integrierten Management. Der Qualitätsgedanke wird dabei früher, breiter und anspruchsvoller.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-10', moduleId:'grundlagen', number:10, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 10', title:'Warum reichen Meinungen für QM-Entscheidungen nicht?',
      summary:'Fakten, Nachweise und Daten auswerten, ohne Korrelation vorschnell mit einer Ursache zu verwechseln.',
      topics:['Faktengestützte Entscheidungsfindung','Tatsachen statt Annahmen','Analyse von Daten und Informationen','Ursache-Wirkungs-Zusammenhänge','Unsicherheit und unbeabsichtigte Folgen'],
      source:'TÜV Modul 1, Abschnitt 2.2.3 „Sieben Grundsätze des Qualitätsmanagements“, Unterpunkt „Faktengestützte Entscheidungsfindung“',
      sourceNote:'Das Zahlenbeispiel mit zwei CARAT-Linien ist eine neu entwickelte Übung zur Unterscheidung von Beobachtung, Zusammenhang und nachgewiesener Ursache.',
      scenes:[
        {start:0,end:8,visual:'evidence-intro',kicker:'Lernpfad 1 · Kurzvideo 10',title:'Warum reichen Meinungen für QM-Entscheidungen nicht?',caption:'Eine plausible Vermutung kann ein guter Start sein – aber noch kein belastbarer Entscheidungsgrund.',narration:'Im zehnten Kurzvideo geht es um faktengestützte Entscheidungen. Wir trennen Beobachtung, Vermutung, Datenanalyse und begründete Entscheidung sauber voneinander.'},
        {start:8,end:21,visual:'evidence-claim',kicker:'Aussage oder Tatsache?',title:'„Linie A macht ständig Probleme“',caption:'Eine häufig wiederholte Einschätzung bleibt zunächst eine Behauptung ohne geklärten Bezugsrahmen.',narration:'Im Team heißt es: Linie A macht ständig Probleme. Diese Aussage kann wichtig sein, sagt aber noch nicht, welcher Zeitraum, welche Menge oder welche Art von Abweichung gemeint ist.'},
        {start:21,end:35,visual:'evidence-data',kicker:'Vergleichbar machen',title:'Gleiche Bezugsgröße, klarer Zeitraum',caption:'Zwei Linien werden anhand derselben produzierten Menge und desselben Beobachtungszeitraums verglichen.',narration:'CARAT vergleicht deshalb beide Linien unter gleichen Bedingungen. Bei je sechshundert Packungen zeigt Linie A achtzehn Nahtauffälligkeiten, Linie B dagegen vier. Nun ist der Unterschied nachvollziehbar.'},
        {start:35,end:49,visual:'evidence-causality',kicker:'Wichtige Denkgrenze',title:'Ein Zusammenhang beweist noch keine Ursache',caption:'Die Zahlen zeigen, wo genauer untersucht werden sollte – nicht automatisch, warum der Unterschied entstand.',narration:'Die Daten zeigen einen auffälligen Zusammenhang, aber noch keine Ursache. Materialcharge, Maschineneinstellung oder Prüfweise könnten mitwirken. Diese Möglichkeiten müssen getrennt untersucht werden.'},
        {start:49,end:64,visual:'evidence-proof',kicker:'Objektivität erhöhen',title:'Tatsachen, Nachweise und Analyse verbinden',caption:'Messwerte, Prüfprotokolle und reproduzierbare Versuche verdichten die Grundlage für eine Entscheidung.',narration:'Messwerte, Prüfprotokolle und gezielte Versuche liefern weitere Nachweise. Erst wenn Ergebnisse reproduzierbar sind, wächst das Vertrauen, dass eine angenommene Ursache tatsächlich wirksam beeinflusst werden kann.'},
        {start:64,end:79,visual:'evidence-tradeoff',kicker:'Folgen mitdenken',title:'Eine Entscheidung kann Nebenwirkungen haben',caption:'Weniger Geschwindigkeit könnte Auffälligkeiten senken, aber zugleich Durchlaufzeit und Lieferfähigkeit beeinflussen.',narration:'Auch eine datenbasierte Entscheidung enthält Unsicherheit. Wird die Geschwindigkeit reduziert, sinken vielleicht Nahtauffälligkeiten, zugleich kann sich die Durchlaufzeit erhöhen. Beabsichtigte und unbeabsichtigte Folgen gehören in die Bewertung.'},
        {start:79,end:90,visual:'evidence-recap',kicker:'Fakten-Merksatz',title:'Frage → Daten → Analyse → Entscheidung → Wirkung prüfen',caption:'Fakten ersetzen nicht das Denken. Sie machen das Denken nachvollziehbarer und objektiver.',narration:'Merke: Gute QM-Entscheidungen folgen einer prüfbaren Spur. Frage klären, vergleichbare Daten erheben, Zusammenhänge untersuchen, entscheiden und anschließend die tatsächliche Wirkung bewerten.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-11', moduleId:'grundlagen', number:11, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 11', title:'Was macht Management eigentlich?',
      summary:'Planung, Durchsetzung, Kontrolle, Steuerung und Ressourceneinsatz als allgemeinen Managementkreislauf verstehen.',
      topics:['Management als Gesamtheit der Steuerungsaufgaben','Planung von Zielen und Leistungsstandards','Durchsetzung des Geplanten','Soll-Ist-Kontrolle','Steuerung und Ressourceneinsatz'],
      source:'TÜV Modul 1, Abschnitt 2.1.1 „Management“; Begriffsdefinition nach ISO 9000',
      sourceNote:'Im Unterschied zu Kurzvideo 6 erklärt dieses Video den allgemeinen Managementkreislauf und nicht die besonderen Bestandteile des Qualitätsmanagements. Die CARAT-Darstellung ist eine neue didaktische Übertragung.',
      scenes:[
        {start:0,end:8,visual:'management-intro',kicker:'Lernpfad 1 · Kurzvideo 11',title:'Was macht Management eigentlich?',caption:'Management ist nicht bloß eine Position – es ist die Gesamtheit abgestimmter Steuerungsaufgaben.',narration:'Management ist mehr als Chefsein: Es richtet die Aufgaben eines arbeitsteiligen Systems abgestimmt auf gemeinsame Ziele aus.'},
        {start:8,end:21,visual:'management-plan',kicker:'Aufgabe 1 · Planung',title:'Ziel und Leistungsstandard vorab festlegen',caption:'Ohne ein geklärtes Soll lässt sich später weder Zielerreichung noch Abweichung beurteilen.',narration:'Planung beginnt vor der Ausführung. Ziele und Leistungsstandards werden so festgelegt, dass später erkennbar ist, welches Ergebnis erreicht werden soll.'},
        {start:21,end:34,visual:'management-execute',kicker:'Aufgabe 2 · Durchsetzung',title:'Das Geplante in die Arbeit bringen',caption:'Ein Plan wirkt erst, wenn Aufgaben ausgelöst, Zuständigkeiten aktiviert und Mittel eingesetzt werden.',narration:'Durchsetzung bedeutet, das Geplante in die Organisation zu bringen: Aufgaben werden ausgelöst, Zuständigkeiten aktiviert und notwendige Mittel tatsächlich eingesetzt.'},
        {start:34,end:48,visual:'management-check',kicker:'Aufgabe 3 · Kontrolle',title:'Soll und Ist vergleichbar machen',caption:'Kontrolle zeigt den Grad der Zielerreichung und macht Abweichungen transparent.',narration:'Kontrolle vergleicht den gewünschten Soll-Zustand mit der tatsächlichen Ist-Situation. Dadurch wird der Grad der Zielerreichung sichtbar, ebenso wie jede Abweichung.'},
        {start:48,end:63,visual:'management-steer',kicker:'Aufgabe 4 · Steuerung',title:'Mit den Erkenntnissen den Kurs anpassen',caption:'Prioritäten, Entscheidungen und Ressourceneinsatz werden an die tatsächliche Situation angepasst.',narration:'Steuerung nutzt diese Informationen. Das Management passt Entscheidungen, Prioritäten oder den Ressourceneinsatz an, damit die Organisation wieder auf Zielkurs kommt und ihre Leistung weiterentwickelt.'},
        {start:63,end:77,visual:'management-resources',kicker:'Das Ganze im Blick',title:'Ressourcen dienen den übergeordneten Zielen',caption:'Lokale Vorteile dürfen die Gesamtleistung der Organisation nicht verschlechtern.',narration:'Ein Bereich darf dabei nicht nur sich selbst optimieren. Menschen, Zeit und Mittel müssen insgesamt sinnvoll eingesetzt werden, ohne die übergeordneten Ziele der Organisation aus dem Blick zu verlieren.'},
        {start:77,end:90,visual:'management-recap',kicker:'Management-Merksatz',title:'Planen → durchsetzen → kontrollieren → steuern',caption:'Vier Aufgaben verbinden Ziel, tägliche Arbeit, Vergleich und Kurskorrektur.',narration:'Merke: Planen legt Soll und Standard fest. Durchsetzen bringt den Plan in die Arbeit. Kontrolle macht Soll und Ist vergleichbar. Steuerung hält das Gesamtsystem zielorientiert.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-12', moduleId:'grundlagen', number:12, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 12', title:'Was erwartet der Kunde, obwohl er es nicht sagt?',
      summary:'Ausdrücklich formulierte Anforderungen sicher von stillschweigend vorausgesetzten Erwartungen unterscheiden.',
      topics:['Ausdrücklich formulierte Anforderungen','Vorausgesetzte Anforderungen','Messbare Kundenspezifikationen','Nicht artikulierte Erwartungen','Ermittlung stillschweigender Erwartungen'],
      source:'TÜV Modul 1, Abschnitt 2.1.2 „Qualität“, Unterpunkt zu ausdrücklich formulierten und vorausgesetzten Kundenanforderungen',
      sourceNote:'Das CARAT-Auftragsbeispiel ist eine neue didaktische Übertragung des Lehrtextes. Kano-Kategorien und Begeisterungsmerkmale bleiben bewusst Kurzvideo 5 vorbehalten.',
      scenes:[
        {start:0,end:8,visual:'customer-hidden-intro',kicker:'Lernpfad 1 · Kurzvideo 12',title:'Was erwartet der Kunde, obwohl er es nicht sagt?',caption:'Kundenanforderungen können sichtbar vereinbart oder stillschweigend vorausgesetzt werden.',narration:'Im zwölften Kurzvideo unterscheiden wir zwei Gruppen von Kundenanforderungen: ausdrücklich formulierte und stillschweigend vorausgesetzte.'},
        {start:8,end:21,visual:'customer-explicit',kicker:'Gruppe 1 · ausdrücklich',title:'Benannt, messbar und vereinbart',caption:'Menge, Größe, Leistung oder Termin können eindeutig beschrieben und überprüft werden.',narration:'Ausdrückliche Anforderungen nennt der Kunde konkret. Sie sind messbar und werden zwischen Kunde und Lieferant vereinbart, zum Beispiel Menge, Größe, Leistung oder Termin.'},
        {start:21,end:34,visual:'customer-order',kicker:'CARAT-Auftrag',title:'Der sichtbare Teil der Bestellung',caption:'500 Kartons · Schnittgröße 20–40 mm · Lieferung Freitag.',narration:'Ein CARAT-Kunde bestellt fünfhundert Kartons Brokkoli, Schnittgröße zwanzig bis vierzig Millimeter, Lieferung am Freitag. Diese Angaben sind sichtbar und überprüfbar.'},
        {start:34,end:48,visual:'customer-presumed',kicker:'Gruppe 2 · vorausgesetzt',title:'Nicht genannt – aber selbstverständlich erwartet',caption:'Der Kunde setzt Gebrauchstauglichkeit und eine verlässliche Beschaffenheit voraus, ohne jeden Punkt aufzuschreiben.',narration:'Daneben setzt der Kunde Dinge voraus, ohne sie aufzuschreiben. Die Ware soll zuverlässig für den vorgesehenen Gebrauch geeignet sein und der zugesagten Beschaffenheit entsprechen.'},
        {start:48,end:61,visual:'customer-service',kicker:'Nicht nur das Produkt',title:'Auch Verhalten wird vorausgesetzt',caption:'Freundlichkeit, Erreichbarkeit und angemessene Problembearbeitung sind oft nicht Teil jeder Bestellzeile.',narration:'Auch Verhalten kann stillschweigend erwartet werden: freundlicher Kontakt, erreichbare Ansprechpartner sowie eine schnelle und kulante Bearbeitung, falls ein Problem entsteht.'},
        {start:61,end:76,visual:'customer-discovery',kicker:'Die besondere Herausforderung',title:'Unausgesprochene Erwartungen sichtbar machen',caption:'Gespräche, Rückmeldungen und der tatsächliche Gebrauch liefern Hinweise auf das, was im Auftrag fehlt.',narration:'Gerade weil diese Erwartungen nicht im Auftrag stehen, muss das Unternehmen genauer hinhören: Gespräche, Rückmeldungen und der tatsächliche Gebrauch liefern wichtige Hinweise.'},
        {start:76,end:90,visual:'customer-recap',kicker:'Anforderungs-Merksatz',title:'Vereinbart oder vorausgesetzt – beides zählt',caption:'Ausdrücklich heißt benannt. Vorausgesetzt heißt unausgesprochen, aber selbstverständlich erwartet.',narration:'Merke: Ausdrückliche Anforderungen sind benannt und vereinbart. Vorausgesetzte Anforderungen bleiben oft unausgesprochen, sind für den Kunden aber selbstverständlich. Beide müssen verstanden werden.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-13', moduleId:'grundlagen', number:13, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 13', title:'Warum braucht Wachstum klare QM-Strukturen?',
      summary:'Erkennen, wann ein informelles Ordnungssystem durch Wachstum, Arbeitsteilung und fehlende Transparenz an seine Grenzen kommt.',
      topics:['Grenzen informeller Absprachen','Wachstum und Arbeitsteilung als QMS-Anlass','Verlust des Gesamtüberblicks','Dokumentiertes Ordnungssystem','Organisatorische Transparenz'],
      source:'TÜV Modul 1, Abschnitt 2.3.1 „Anlass für die Einführung eines Qualitätsmanagementsystems“',
      sourceNote:'Dieses Video behandelt ausschließlich den Einführungsanlass und den Übergang vom persönlichen Wissen zum transparenten Ordnungssystem. Die konkreten Grundelemente folgen getrennt in Kurzvideo 14.',
      scenes:[
        {start:0,end:8,visual:'growth-intro',kicker:'Lernpfad 1 · Kurzvideo 13',title:'Warum braucht Wachstum klare QM-Strukturen?',caption:'Ein erfolgreiches kleines Team kann an genau den Abläufen scheitern, die anfangs problemlos funktioniert haben.',narration:'Im dreizehnten Kurzvideo sehen wir, warum ein Betrieb trotz anfänglichen Erfolgs irgendwann ein dokumentiertes Qualitätsmanagementsystem braucht.'},
        {start:8,end:21,visual:'growth-head-system',kicker:'Der kleine Betrieb',title:'Das Ordnungssystem steckt im Kopf',caption:'Direkte Absprachen und persönlicher Überblick ersetzen zunächst schriftliche Festlegungen.',narration:'In einem kleinen Team funktionieren direkte Absprachen. Der Inhaber kennt Aufträge, Zuständigkeiten und Abläufe und verteilt alles fallweise aus dem Kopf.'},
        {start:21,end:34,visual:'growth-orders',kicker:'Der Wendepunkt',title:'Mehr Kunden verändern die Organisation',caption:'Mit Aufträgen, Mitarbeitenden und Übergaben wächst auch der Abstimmungsbedarf.',narration:'Wachsen Kundenzahl und Betrieb, steigen Aufträge, Mitarbeitende und Übergaben. Die bisherige persönliche Abstimmung erreicht nicht mehr alle Beteiligten zuverlässig.'},
        {start:34,end:48,visual:'growth-communication',kicker:'Arbeitsteilung',title:'Der gemeinsame Überblick geht verloren',caption:'Nicht jeder sieht noch, was andere tun und wie die einzelnen Tätigkeiten zusammenhängen.',narration:'Durch Arbeitsteilung verliert das Team den Überblick. Mitarbeitende sehen nicht mehr, was andere tun, und Zusammenhänge zwischen Aufträgen und Abläufen bleiben verborgen.'},
        {start:48,end:62,visual:'growth-consequences',kicker:'Die Folgen werden sichtbar',title:'Uneinheitliche Arbeit erreicht den Kunden',caption:'Schwankende Ausführung, Fehler und Beschwerden zeigen, dass das informelle System nicht mehr trägt.',narration:'Dann schwankt die Ausführung: Aufträge werden unterschiedlich bearbeitet, Fehler gelangen zum Kunden, Beschwerden nehmen zu und Vertrauen gerät in Gefahr.'},
        {start:62,end:77,visual:'growth-transparency',kicker:'Der notwendige Übergang',title:'Vom Kopf in ein transparentes Ordnungssystem',caption:'Wichtige Organisationsregeln werden sichtbar, nachvollziehbar und gemeinsam nutzbar.',narration:'Die Lösung ist, das bisher nur im Kopf vorhandene Ordnungssystem sichtbar zu machen. Dokumentierte Regeln schaffen Transparenz und geben dem wachsenden Betrieb einen gemeinsamen Arbeitsstand.'},
        {start:77,end:90,visual:'growth-recap',kicker:'Wachstums-Merksatz',title:'Wissen von einzelnen Köpfen unabhängig machen',caption:'Ein QMS stabilisiert die Organisation, wenn persönliche Abstimmung allein nicht mehr alle erreicht.',narration:'Merke: Ein QMS ersetzt persönliche Absprachen nicht, sondern macht wichtige Organisationsregeln unabhängig von einzelnen Köpfen verlässlich nutzbar. Wachstum wird dadurch beherrschbarer.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-14', moduleId:'grundlagen', number:14, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 14', title:'Was, wer, wie, wann, wo und womit?',
      summary:'Aufbauorganisation, Ablauforganisation und eingesetzte Mittel mit sechs praktischen Ordnungsfragen verbinden.',
      topics:['Aufbauorganisation als Zuständigkeitsstruktur','Ablauforganisation als Prozessordnung','Regelung eingesetzter Mittel','Sechs Ordnungsfragen eines QMS','Schriftlich fixiertes Ordnungssystem'],
      source:'TÜV Modul 1, Abschnitt 2.3.2 „Grundelemente“',
      sourceNote:'Qualitätspolitik und Qualitätsziele wurden bereits in Kurzvideo 6 behandelt. Dieses Video konzentriert sich ohne Wiederholung auf Aufbauorganisation, Ablauforganisation, Mittel und die sechs Ordnungsfragen. Das CARAT-Beispiel ist eine didaktische Übertragung.',
      scenes:[
        {start:0,end:8,visual:'elements-intro',kicker:'Lernpfad 1 · Kurzvideo 14',title:'Was, wer, wie, wann, wo und womit?',caption:'Sechs Fragen machen aus einer allgemeinen Vorgabe ein praktisch nutzbares Ordnungssystem.',narration:'Im vierzehnten Kurzvideo ordnen wir die noch offenen Grundelemente eines QMS mit sechs praktischen Fragen.'},
        {start:8,end:21,visual:'elements-frame',kicker:'Der organisatorische Rahmen',title:'Aufbau, Ablauf und Mittel gehören zusammen',caption:'Die festgelegte Richtung braucht eine tragfähige Struktur für Zuständigkeit, Durchführung und Ausstattung.',narration:'Nachdem die Richtung bereits feststeht, braucht das System eine tragfähige Struktur: Aufbauorganisation, Ablauforganisation und geregelte Mittel.'},
        {start:21,end:34,visual:'elements-build',kicker:'Grundelement 1',title:'Aufbauorganisation: Wer und wo?',caption:'Sie ordnet Verantwortung, Befugnis und die organisatorische Verankerung einer Aufgabe.',narration:'Aufbauorganisation beantwortet vor allem: Wer ist verantwortlich, wer darf entscheiden und wo ist die Aufgabe organisatorisch verankert?'},
        {start:34,end:47,visual:'elements-flow',kicker:'Grundelement 2',title:'Ablauforganisation: Was, wie und wann?',caption:'Sie beschreibt die Ausführung einzelner Tätigkeiten und ihr Zusammenwirken im Prozess.',narration:'Ablauforganisation legt fest, was geschieht, wie Tätigkeiten ausgeführt werden, wann sie stattfinden und wie verbundene Prozessschritte ineinandergreifen.'},
        {start:47,end:61,visual:'elements-means',kicker:'Grundelement 3',title:'Eingesetzte Mittel: Womit?',caption:'Menschen, Anlagen, Werkzeuge, Maschinen, Einrichtungen, Techniken und Methoden bilden die Arbeitsgrundlage.',narration:'Die Mittel beantworten womit: Mitarbeitende, Anlagen, Werkzeuge, Maschinen, Einrichtungen, Techniken und Methoden. Ihr Einsatz muss angemessen geregelt sein.'},
        {start:61,end:76,visual:'elements-carat',kicker:'CARAT-Beispiel · Warenannahme',title:'Sechs Fragen an eine Temperaturprüfung',caption:'Prüfaufgabe, Zuständigkeit, Vorgehen, Zeitpunkt, Messort und Prüfmittel werden eindeutig festgelegt.',narration:'Bei CARAT könnte die Warenannahme festlegen: Temperatur prüfen; zuständig ist der Wareneingang; gemessen wird am definierten Ort, bei jeder Lieferung, mit geeignetem Thermometer und Nachweis.'},
        {start:76,end:90,visual:'elements-recap',kicker:'Ordnungs-Merksatz',title:'Sechs klare Antworten machen Vorgaben nutzbar',caption:'Was · wer · wie · wann · wo · womit – zusammen ergeben sie ein anwendbares Ordnungssystem.',narration:'Merke: Was, wer, wie, wann, wo und womit? Wenn ein QMS diese sechs Fragen klar beantwortet, wird aus Vorgaben ein nutzbares Ordnungssystem.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-15', moduleId:'grundlagen', number:15, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 15', title:'Produkt prüfen, Prozess sichern oder das Ganze managen?',
      summary:'Produktbezogene Qualitätskontrolle, prozessorientierte Qualitätssicherung und umfassendes Qualitätsmanagement direkt vergleichen.',
      topics:['Produktbezogene Qualitätskontrolle','Prozessorientierte Qualitätssicherung','Qualitätsmanagement entlang der Wertschöpfungskette','Vor- und nachgelagerte Prozesse','Direktvergleich der drei Betrachtungsebenen'],
      source:'TÜV Modul 1, Abschnitt 2.2.2 „Qualitätsmanagement in der Praxis“',
      sourceNote:'Dieses Video vergleicht die drei Betrachtungsebenen. Es wiederholt weder die historische Entwicklung aus Kurzvideo 9 noch das Zusammenspiel der Systemelemente aus Kurzvideo 8. Das CARAT-Beispiel ist eine didaktische Übertragung.',
      scenes:[
        {start:0,end:8,visual:'levels-intro',kicker:'Lernpfad 1 · Kurzvideo 15',title:'Produkt prüfen, Prozess sichern oder das Ganze managen?',caption:'Drei Blickweiten gehören zusammen, beantworten aber unterschiedliche Fragen.',narration:'Im fünfzehnten Kurzvideo vergleichen wir drei Ebenen: Qualitätskontrolle, Qualitätssicherung und Qualitätsmanagement entlang der gesamten Wertschöpfungskette.'},
        {start:8,end:21,visual:'levels-product',kicker:'Ebene 1 · Produkt',title:'Qualitätskontrolle prüft das Ergebnis',caption:'Festgelegte Produktvorgaben werden während oder am Ende der Herstellung überprüft.',narration:'Bei der produktbezogenen Qualitätskontrolle steht das konkrete Ergebnis im Mittelpunkt. Produktvorgaben werden festgelegt und mit geeigneten Prüfungen während oder am Ende der Herstellung verglichen.'},
        {start:21,end:34,visual:'levels-carat-product',kicker:'CARAT-Beispiel',title:'Stimmen Gewicht und Würfelgröße?',caption:'Die fertige Mango-Packung wird anhand definierter Produktmerkmale beurteilt.',narration:'Bei einer CARAT-Mangopackung könnten Packungsgewicht und Würfelgröße geprüft werden. Der Blick bleibt auf der fertigen Ware und ihren festgelegten Merkmalen.'},
        {start:34,end:48,visual:'levels-process',kicker:'Ebene 2 · Prozess',title:'Qualitätssicherung wirkt früher',caption:'Negative Einflüsse auf das Endprodukt sollen bereits während der Herstellung erkannt und vermieden werden.',narration:'Qualitätssicherung richtet den Blick auf die Herstellung. Tätigkeiten, Materialeinsatz und Arbeitsmittel werden so geplant, dass negative Einflüsse auf das spätere Ergebnis möglichst früh vermieden werden.'},
        {start:48,end:62,visual:'levels-prevention',kicker:'Vorbeugender Blick',title:'Nicht erst das Endprodukt abwarten',caption:'Beherrschte Prozessbedingungen sollen verhindern, dass die gewünschte Produktqualität überhaupt gefährdet wird.',narration:'Bei CARAT werden deshalb die Bedingungen beim Schneiden und Abfüllen geplant und überwacht. Der Prozess soll die geforderten Merkmale zuverlässig hervorbringen, bevor die Endprüfung beginnt.'},
        {start:62,end:77,visual:'levels-value-chain',kicker:'Ebene 3 · gesamte Wertschöpfung',title:'Qualitätsmanagement reicht über die Herstellung hinaus',caption:'Auch Lieferanten, Qualifizierung, unterstützende Bereiche, Auslieferung und Kundenbetreuung werden einbezogen.',narration:'Qualitätsmanagement erweitert den Blick auf die gesamte Wertschöpfungskette. Vor- und nachgelagerte Prozesse, unterstützende Bereiche, Lieferantenauswahl, Qualifizierung, Auslieferung und Service gehören ebenfalls dazu.'},
        {start:77,end:90,visual:'levels-recap',kicker:'Ebenen-Merksatz',title:'Produkt · Prozess · gesamte Wertschöpfung',caption:'Kontrolle beurteilt das Produkt. Sicherung beherrscht die Herstellung. QM verbindet die gesamte Leistungskette.',narration:'Merke: Qualitätskontrolle betrachtet das Produkt. Qualitätssicherung schützt den Herstellungsprozess. Qualitätsmanagement lenkt die gesamte Wertschöpfungskette. Die Blickweite wächst von Ebene zu Ebene.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-16', moduleId:'grundlagen', number:16, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 16', title:'Warum sind Lieferantenbeziehungen ein Qualitätsthema?',
      summary:'Die sieben QM-Grundsätze kompakt einordnen und Beziehungsmanagement als bislang offenen Grundsatz verstehen.',
      topics:['Kompakte Ordnung der sieben QM-Grundsätze','Beziehungsmanagement','Einfluss interessierter Parteien','Lieferanten- und Partnernetzwerke','Nachhaltiger Erfolg durch gelenkte Beziehungen'],
      source:'TÜV Modul 1, Abschnitt 2.2.3 „Sieben Grundsätze des Qualitätsmanagements“, Unterpunkt „Beziehungsmanagement“',
      sourceNote:'Die ersten sechs Grundsätze werden nur zur Orientierung benannt und nicht erneut erklärt. Inhaltlicher Schwerpunkt ist ausschließlich das bisher offene Beziehungsmanagement. Das CARAT-Beispiel ist eine didaktische Übertragung.',
      scenes:[
        {start:0,end:8,visual:'relations-intro',kicker:'Lernpfad 1 · Kurzvideo 16',title:'Warum sind Lieferantenbeziehungen ein Qualitätsthema?',caption:'Organisationen erzeugen ihre Leistung nicht isoliert – Beziehungen wirken auf das Ergebnis.',narration:'Im sechzehnten Kurzvideo schließen wir die sieben QM-Grundsätze mit dem bislang offenen Beziehungsmanagement ab.'},
        {start:8,end:20,visual:'relations-seven',kicker:'Die Gesamtordnung',title:'Sieben Grundsätze – ein gemeinsamer Orientierungsrahmen',caption:'Kunde · Führung · Personen · Prozesse · Verbesserung · Fakten · Beziehungen.',narration:'Die sieben Grundsätze bilden einen gemeinsamen Orientierungsrahmen. Sechs wurden bereits in früheren Videos eingeordnet. Jetzt betrachten wir gezielt den siebten: Beziehungsmanagement.'},
        {start:20,end:34,visual:'relations-influence',kicker:'Interessierte Parteien',title:'Andere Organisationen beeinflussen die eigene Leistung',caption:'Lieferanten und Partner können Verfügbarkeit, Information und Leistungsfähigkeit der eigenen Abläufe mitbestimmen.',narration:'Interessierte Parteien beeinflussen die Leistung einer Organisation. Besonders Lieferanten und Partnernetzwerke wirken darauf, ob benötigte Leistungen und Informationen verlässlich verfügbar sind.'},
        {start:34,end:48,visual:'relations-carat',kicker:'CARAT-Beispiel',title:'Die eigene Qualität beginnt vor dem eigenen Werkstor',caption:'Rohware, Terminangaben und Begleitinformationen des Lieferanten wirken unmittelbar auf CARATs Leistung.',narration:'CARAT ist auf vereinbarte Rohware, verlässliche Termine und brauchbare Begleitinformationen angewiesen. Schwächen in dieser Beziehung können sich durch die gesamte eigene Leistung fortsetzen.'},
        {start:48,end:62,visual:'relations-manage',kicker:'Beziehungen lenken',title:'Erwartungen klären und Leistung gemeinsam entwickeln',caption:'Information, Rückmeldung, Bewertung und abgestimmte Entwicklung machen Beziehungen beherrschbarer.',narration:'Beziehungsmanagement bedeutet, relevante Beziehungen bewusst zu lenken: Erwartungen klären, Informationen austauschen, Leistung bewerten und Verbesserungsmöglichkeiten gemeinsam bearbeiten.'},
        {start:62,end:76,visual:'relations-network',kicker:'Mehr als ein Einzelvertrag',title:'Partnernetzwerke langfristig betrachten',caption:'Nachhaltiger Erfolg entsteht wahrscheinlicher, wenn wichtige Beziehungen nicht nur kurzfristig und einseitig behandelt werden.',narration:'Der niedrigste Einzelpreis allein sichert keinen nachhaltigen Erfolg. Entscheidend ist, wie eine Beziehung die eigene Leistung langfristig beeinflusst und welchen verlässlichen Beitrag beide Seiten leisten.'},
        {start:76,end:90,visual:'relations-recap',kicker:'Beziehungs-Merksatz',title:'Qualität endet nicht an der Unternehmensgrenze',caption:'Relevante Beziehungen erkennen, ihre Wirkung verstehen und sie gezielt lenken.',narration:'Merke: Qualität endet nicht an der Unternehmensgrenze. Wer relevante Beziehungen erkennt, ihre Wirkung versteht und sie gezielt lenkt, erhöht die Wahrscheinlichkeit nachhaltigen Erfolgs.'}
      ]
    },
    {
      id:'lernpfad-1-qualitaet-kurzvideo-17', moduleId:'grundlagen', number:17, duration:90,
      chapter:'Lernpfad 1 · Qualität verstehen', section:'Kurzvideo 17', title:'Wann rechnet sich ein Qualitätsmanagementsystem?',
      summary:'Marktposition, Betriebsergebnis und Amortisationsdauer als ergänzende wirtschaftliche QMS-Wirkungen beurteilen.',
      topics:['Sicherung der Marktposition','Erhöhung des Marktanteils','Betriebsergebnis als Nutzenmaß','Amortisationsprinzip','Rechnerisches Amortisationsbeispiel'],
      source:'TÜV Modul 1, Abschnitt 2.3.3 „Nutzen eines Qualitätsmanagementsystems“',
      sourceNote:'Fehlerkosten und Prozessverschwendung bleiben ausschließlich Thema von Kurzvideo 4. Die Zahlen zur Amortisation sind ein neu entwickeltes Rechenbeispiel und keine Erfolgszusage.',
      scenes:[
        {start:0,end:8,visual:'roi-intro',kicker:'Lernpfad 1 · Kurzvideo 17',title:'Wann rechnet sich ein Qualitätsmanagementsystem?',caption:'Der wirtschaftliche Nutzen zeigt sich nicht nur in vermiedenen Verlusten, sondern auch in Markt und Ergebnis.',narration:'Im siebzehnten Kurzvideo ergänzen wir den wirtschaftlichen Blick um Marktposition, Betriebsergebnis und Amortisation.'},
        {start:8,end:21,visual:'roi-timeline',kicker:'Aufwand und Wirkung',title:'Einführungskosten entstehen zuerst',caption:'Schulung, Analyse und Aufbau benötigen Aufwand; messbare Nutzenwirkungen entwickeln sich anschließend über die Zeit.',narration:'Die Einführung eines QMS benötigt zunächst Zeit und Mittel. Der wirtschaftliche Nutzen entsteht danach schrittweise und muss über einen festgelegten Zeitraum beobachtet werden.'},
        {start:21,end:35,visual:'roi-market-chain',kicker:'Wirkungskette',title:'Zufriedenheit kann die Marktposition stärken',caption:'Stabilere Leistung kann Vertrauen fördern, Kunden halten und die Wettbewerbsposition verbessern.',narration:'Im TÜV-Beispiel führt höhere Kundenzufriedenheit dazu, dass der Betrieb seine Marktposition sichert und seinen Marktanteil erkennbar erhöht. Das ist eine mögliche Marktwirkung des QMS.'},
        {start:35,end:49,visual:'roi-result',kicker:'Betriebsergebnis',title:'Wirtschaftliche Wirkungen zusammenführen',caption:'Ergebnisverbesserungen können aus mehreren messbaren Nutzenbeiträgen entstehen – nicht nur aus zusätzlichem Umsatz.',narration:'Für die Zwischenbilanz werden die wirtschaftlichen Wirkungen im Betriebsergebnis sichtbar. Entscheidend ist, welchen zusätzlichen Ergebnisbeitrag die eingeführten Verbesserungen tatsächlich erzeugen.'},
        {start:49,end:63,visual:'roi-formula',kicker:'Amortisationsprinzip',title:'Wann ist der Einführungsaufwand zurückverdient?',caption:'Amortisationsdauer = Einführungskosten ÷ jährlicher zusätzlicher Ergebnisbeitrag.',narration:'Die Amortisationsdauer zeigt, wann der anfängliche Aufwand rechnerisch zurückverdient ist. Dafür werden die Einführungskosten durch den jährlichen zusätzlichen Ergebnisbeitrag geteilt.'},
        {start:63,end:77,visual:'roi-example',kicker:'Rechenbeispiel',title:'18.000 € ÷ 27.000 € pro Jahr = etwa acht Monate',caption:'Das Beispiel zeigt nur die Rechenlogik; die tatsächlichen Werte sind für jedes Unternehmen gesondert nachzuweisen.',narration:'Ein Übungsbeispiel: Achtzehntausend Euro Einführungskosten geteilt durch siebenundzwanzigtausend Euro jährlichen Ergebnisbeitrag ergeben null Komma sechs sieben Jahre, also ungefähr acht Monate.'},
        {start:77,end:90,visual:'roi-recap',kicker:'Amortisations-Merksatz',title:'Nutzen messen – nicht automatisch unterstellen',caption:'Marktwirkung, Ergebnisbeitrag und Zeitraum müssen mit realen Unternehmensdaten überprüft werden.',narration:'Merke: Eine kurze Amortisation ist möglich, aber keine Garantie. Marktposition, Ergebnisbeitrag und tatsächlicher Zeitraum müssen mit den eigenen Unternehmensdaten nachgewiesen werden.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-01', moduleId:'prozess', number:18, pathNumber:1, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 1', title:'Woraus besteht ein Prozess?',
      summary:'Eingabe, Mittel, Aktivitäten und Ergebnis als vier klar getrennte Prozessbausteine verstehen.',
      topics:['Eingaben','Mittel','Aktivitäten','Spezifiziertes Ergebnis'],
      source:'TÜV Modul 1, Abschnitt 3.1 „Was ist ein Prozess?“',
      sourceNote:'Dieses Video behandelt ausschließlich den Aufbau eines einzelnen Prozesses. Produktions- und Dienstleistungsvergleich, Ablaufarten, Schnittstellen und Prozessmanagement folgen in eigenen Videos.',
      scenes:[
        {start:0,end:8,visual:'p1-intro',kicker:'Lernpfad 2 · Kurzvideo 1',title:'Woraus besteht ein Prozess?',caption:'Vier Bausteine machen aus einer Tätigkeit einen nachvollziehbaren Umwandlungsweg.',narration:'Wir beginnen Kapitel drei mit dem Grundgerüst eines Prozesses: Eingabe, Mittel, Aktivitäten und ein festgelegtes Ergebnis.'},
        {start:8,end:21,visual:'p1-purpose',kicker:'Nicht nur beschäftigt sein',title:'Ein Prozess verfolgt ein bestimmtes Ergebnis',caption:'Einzelne Handgriffe werden erst durch ihre gemeinsame Ausrichtung zu einem Prozess.',narration:'Eine Tätigkeit allein ist noch keine vollständige Prozessbeschreibung. Entscheidend ist der nachvollziehbare Zusammenhang, durch den etwas Vorhandenes gezielt in ein bestimmtes Ergebnis überführt wird.'},
        {start:21,end:34,visual:'p1-input',kicker:'Baustein 1',title:'Was geht in den Prozess hinein?',caption:'Eingaben können Rohstoffe, Aufträge, Anweisungen oder technische Spezifikationen sein.',narration:'Eingaben sind das, was bearbeitet oder umgesetzt werden soll. Bei CARAT gehören dazu Tiefkühlgemüse, der Kundenauftrag und die vereinbarte Produktspezifikation.'},
        {start:34,end:47,visual:'p1-means',kicker:'Baustein 2',title:'Womit wird die Umwandlung ermöglicht?',caption:'Mittel werden eingesetzt: etwa Personal, Anlagen, Werkzeuge, Methoden und Fähigkeiten.',narration:'Mittel ermöglichen die Bearbeitung, werden aber nicht selbst zum Auftragsergebnis. CARAT benötigt beispielsweise geschulte Mitarbeitende, Waage, Abfüllanlage und eine festgelegte Arbeitsmethode.'},
        {start:47,end:60,visual:'p1-activity',kicker:'Baustein 3',title:'Was geschieht im Prozess?',caption:'Aktivitäten verändern, prüfen oder bearbeiten die Eingaben zielgerichtet.',narration:'Die Aktivitäten bilden die eigentliche Umwandlung. Portionieren, wiegen, kontrollieren und verpacken bearbeiten die Eingaben unter Einsatz der zuvor festgelegten Mittel.'},
        {start:60,end:75,visual:'p1-result',kicker:'Baustein 4',title:'Welches Ergebnis soll entstehen?',caption:'Das Ergebnis muss so beschrieben sein, dass seine beabsichtigte Beschaffenheit erkennbar ist.',narration:'Am Ende steht ein spezifiziertes Ergebnis. Im Beispiel ist das nicht einfach irgendein Beutel, sondern die korrekt gefüllte, geprüfte und gekennzeichnete Packung.'},
        {start:75,end:90,visual:'p1-recap',kicker:'CARAT-Prozessbild',title:'Eingabe plus Mittel plus Aktivitäten führt zum Ergebnis',caption:'Frage bei jedem Prozess: Was hinein? Womit? Was geschieht? Was soll herauskommen?',narration:'Merke dir vier Fragen: Was geht hinein? Womit wird gearbeitet? Was geschieht? Und was soll herauskommen? Erst zusammen beschreiben sie den vollständigen Prozess.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-02', moduleId:'prozess', number:19, pathNumber:2, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 2', title:'Produktions- oder Dienstleistungsprozess?',
      summary:'Materielle Produkterzeugung und Dienstleistung als unterschiedliche, aber gleichwertige Prozessformen vergleichen.',
      topics:['Produktionsprozess','Dienstleistungsprozess','Materielles Ergebnis','Erbrachte Leistung'],
      source:'TÜV Modul 1, Abschnitt 3.1 und Abbildung 9 „Beispiele für Prozesse“',
      sourceNote:'Die vier Prozessbausteine aus Video 1 werden nur angewendet, nicht erneut erklärt. Reihenfolge und Parallelität bleiben ausschließlich Thema von Video 3.',
      scenes:[
        {start:0,end:8,visual:'p2-intro',kicker:'Lernpfad 2 · Kurzvideo 2',title:'Produktions- oder Dienstleistungsprozess?',caption:'Prozesse können ein Produkt herstellen oder eine Leistung für einen Empfänger erbringen.',narration:'Nun vergleichen wir zwei Prozessformen: die Herstellung eines materiellen Produkts und die Erbringung einer Dienstleistung.'},
        {start:8,end:20,visual:'p2-shared',kicker:'Gemeinsame Logik',title:'Beide Prozessformen erzeugen einen festgelegten Nutzen',caption:'Unterschiedlich ist vor allem, welche Art von Ergebnis für den Empfänger entsteht.',narration:'Beide folgen dem bekannten Prozessgerüst und brauchen klare Vorgaben. Der entscheidende Unterschied liegt darin, ob überwiegend ein Produkt oder eine erbrachte Leistung entsteht.'},
        {start:20,end:34,visual:'p2-production',kicker:'CARAT · Produktion',title:'Aus Rohware wird eine verkaufsfähige Packung',caption:'Tiefkühlgemüse wird verarbeitet, geprüft, abgefüllt und gekennzeichnet.',narration:'Im Produktionsprozess wird bei CARAT aus Tiefkühlgemüse eine spezifikationsgerechte Verkaufspackung. Das sichtbare Ergebnis ist materiell und kann anschließend gelagert oder ausgeliefert werden.'},
        {start:34,end:48,visual:'p2-service',kicker:'CARAT · Dienstleistung',title:'Ein Kundenauftrag wird zuverlässig abgewickelt',caption:'Bestellung prüfen, Termin abstimmen und die Bereitstellung für den Großkunden koordinieren.',narration:'Bei der Auftrags- und Auslieferungskoordination steht die Leistung im Vordergrund: Der richtige Auftrag wird bestätigt, termingerecht bereitgestellt und für den Empfänger verlässlich organisiert.'},
        {start:48,end:62,visual:'p2-inputs',kicker:'Andere Eingaben',title:'Rohware oder Kundeninformation',caption:'Der Produktionsprozess startet stärker mit Material; der Dienstleistungsprozess stärker mit Auftrag und Bedarf.',narration:'Die Gewichtung der Eingaben unterscheidet sich. Die Produktion verarbeitet vor allem Material und Spezifikation. Die Dienstleistung verarbeitet vor allem Bestellung, Kundeninformation und Terminanforderung.'},
        {start:62,end:76,visual:'p2-results',kicker:'Andere Ergebnisse',title:'Produkt greifbar – Leistung am Nutzen erkennbar',caption:'Eine Packung lässt sich anfassen; eine korrekt erbrachte Koordination zeigt sich an ihrer Wirkung.',narration:'Das Produkt ist körperlich vorhanden. Die Dienstleistung wird vor allem an ihrer Wirkung beurteilt: Ist der Auftrag vollständig, richtig abgestimmt und zum vereinbarten Zeitpunkt erfüllt?'},
        {start:76,end:90,visual:'p2-recap',kicker:'Vergleichs-Merksatz',title:'Nicht die Tätigkeit entscheidet, sondern das beabsichtigte Ergebnis',caption:'Produktionsprozess erzeugt ein materielles Produkt · Dienstleistungsprozess erbringt eine vereinbarte Leistung.',narration:'Merke: Beide sind echte Prozesse. Unterscheide sie danach, welcher Nutzen als Ergebnis vorgesehen ist: ein materielles Produkt oder eine erbrachte Dienstleistung.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-03', moduleId:'prozess', number:20, pathNumber:3, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 3', title:'Nacheinander oder gleichzeitig?',
      summary:'Sequentielle und parallele Aktivitäten nach ihrer fachlichen Abhängigkeit richtig organisieren.',
      topics:['Sequentielle Aktivitäten','Parallele Aktivitäten','Sachliche Abhängigkeit','Kombinierte Abläufe'],
      source:'TÜV Modul 1, Abschnitt 3.1 „Was ist ein Prozess?“',
      sourceNote:'Dieses Video behandelt ausschließlich die innere Organisation von Aktivitäten. Prozessschnittstellen zwischen verschiedenen Prozessen folgen erst in Video 7.',
      scenes:[
        {start:0,end:8,visual:'p3-intro',kicker:'Lernpfad 2 · Kurzvideo 3',title:'Nacheinander oder gleichzeitig?',caption:'Nicht jeder Arbeitsschritt muss warten – aber manche Schritte dürfen erst nach einem eindeutigen Vorgänger beginnen.',narration:'Jetzt betrachten wir, wie Aktivitäten innerhalb eines Prozesses angeordnet werden: sequentiell nacheinander oder parallel zur gleichen Zeit.'},
        {start:8,end:21,visual:'p3-sequential',kicker:'Sequentieller Ablauf',title:'Ein Schritt benötigt das Ergebnis des vorherigen',caption:'Erst wiegen, dann die Füllmenge freigeben und anschließend den Beutel verschließen.',narration:'Sequentiell bedeutet: Ein Schritt baut sachlich auf dem vorherigen auf. Bei CARAT muss die Packung gefüllt und gewogen sein, bevor ihre Füllmenge freigegeben werden kann.'},
        {start:21,end:34,visual:'p3-dependency',kicker:'Warum die Reihenfolge bindend ist',title:'Der notwendige Nachweis fehlt sonst',caption:'Eine Freigabe vor der Messung wäre keine verlässliche Entscheidung.',narration:'Die Reihenfolge ist nicht bloß Gewohnheit. Sie ist notwendig, weil die Freigabe einen Messwert benötigt. Ohne diesen Vorgänger fehlt die Grundlage für den nächsten Schritt.'},
        {start:34,end:48,visual:'p3-parallel',kicker:'Paralleler Ablauf',title:'Unabhängige Tätigkeiten können gleichzeitig laufen',caption:'Während die Ware bereitsteht, können Etiketten und Versandunterlagen vorbereitet werden.',narration:'Parallel bedeutet: Tätigkeiten können gleichzeitig stattfinden, weil sie nicht auf dasselbe Zwischenergebnis warten. So lassen sich Etiketten und Auftragsunterlagen vorbereiten, während die Ware bereitgestellt wird.'},
        {start:48,end:62,visual:'p3-decision',kicker:'Die Entscheidungsfrage',title:'Braucht Schritt B zwingend das Ergebnis von Schritt A?',caption:'Ja bedeutet Reihenfolge · Nein eröffnet die Möglichkeit zur Parallelisierung.',narration:'Prüfe die fachliche Abhängigkeit: Benötigt Schritt B zwingend das Ergebnis von Schritt A? Wenn ja, bleibt die Reihenfolge bindend. Wenn nein, kann paralleles Arbeiten möglich sein.'},
        {start:62,end:76,visual:'p3-hybrid',kicker:'In der Praxis kombiniert',title:'Prozesse enthalten meist beide Ablaufarten',caption:'Vorbereitung parallel · Prüfung und Freigabe anschließend in klarer Reihenfolge.',narration:'Ein guter Ablauf kombiniert beide Formen. Vorbereitungen können parallel laufen. An entscheidenden Prüfpunkten werden die Stränge zusammengeführt und danach wieder geordnet fortgesetzt.'},
        {start:76,end:90,visual:'p3-recap',kicker:'Ablauf-Merksatz',title:'Abhängigkeit bestimmt die Reihenfolge',caption:'Sequentiell, wenn ein Ergebnis benötigt wird · parallel, wenn Tätigkeiten unabhängig sind.',narration:'Merke: Nicht Geschwindigkeit allein entscheidet. Fachliche Abhängigkeit bestimmt, was nacheinander erfolgen muss und was ohne zusätzliches Qualitätsrisiko gleichzeitig stattfinden kann.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-04', moduleId:'prozess', number:21, pathNumber:4, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 4', title:'Warum ist Prozessmanagement ein Kreislauf?',
      summary:'Festlegen, messbar machen, umsetzen, bewerten und verbessern als dauerhafte Lenkungsaufgabe verstehen.',
      topics:['Prozesse festlegen','Messbar machen','Umsetzen','Regelmäßig bewerten','Verbessern'],
      source:'TÜV Modul 1, Abschnitt 3.2 „Prozessmanagement nach ISO 9001“',
      sourceNote:'Das Video erklärt nur den fünfteiligen Grundrhythmus des Prozessmanagements. Einzelne Kennzahlen, Ressourcen, Rollen und PDCA werden in Videos 6 und 10 getrennt vertieft.',
      scenes:[
        {start:0,end:8,visual:'p4-intro',kicker:'Lernpfad 2 · Kurzvideo 4',title:'Warum ist Prozessmanagement ein Kreislauf?',caption:'Ein Prozess bleibt nicht automatisch beherrscht, nur weil er einmal beschrieben wurde.',narration:'Prozessmanagement ist keine einmalige Beschreibung. Es ist die dauerhafte Aufgabe, qualitätsrelevante Prozesse beherrschbar und wirksam zu halten.'},
        {start:8,end:21,visual:'p4-cycle',kicker:'Fünf verbundene Aufgaben',title:'Festlegen, messbar machen, umsetzen, bewerten, verbessern',caption:'Nach der Verbesserung beginnt die Beobachtung erneut – der Prozess bleibt unter bewusster Lenkung.',narration:'Der TÜV-Lernstoff nennt fünf verbundene Aufgaben: Prozesse festlegen, messbar machen, umsetzen, regelmäßig bewerten und verbessern. Keine davon steht für sich allein.'},
        {start:21,end:34,visual:'p4-define',kicker:'1 · Festlegen',title:'Der beabsichtigte Ablauf wird eindeutig vereinbart',caption:'Zweck, erwartetes Ergebnis und grundlegendes Vorgehen müssen bekannt sein.',narration:'Zuerst wird festgelegt, welcher Prozess benötigt wird und welches Ergebnis er zuverlässig hervorbringen soll. So entsteht eine gemeinsame, nachvollziehbare Arbeitsgrundlage.'},
        {start:34,end:47,visual:'p4-measure',kicker:'2 · Messbar machen',title:'Leistung muss beobachtbar werden',caption:'Eine geeignete Messgröße zeigt, ob das erwartete Ergebnis tatsächlich erreicht wird.',narration:'Anschließend wird die Leistung beobachtbar gemacht. Bei einer Abfüllung kann beispielsweise sichtbar werden, wie zuverlässig die vorgegebene Füllmenge eingehalten wird.'},
        {start:47,end:60,visual:'p4-implement',kicker:'3 · Umsetzen',title:'Festlegungen müssen im Alltag tatsächlich wirken',caption:'Der geplante Ablauf wird ausgeführt – nicht nur dokumentiert.',narration:'Danach wird der festgelegte Prozess umgesetzt. Erst die tatsächliche Durchführung zeigt, ob die Planung unter realen Arbeitsbedingungen praktikabel funktioniert.'},
        {start:60,end:75,visual:'p4-evaluate',kicker:'4 · Bewerten',title:'Ergebnis und Ablauf regelmäßig beurteilen',caption:'Beobachtungen zeigen Abweichungen, Schwachstellen und mögliche Veränderungen.',narration:'In festgelegten Abständen wird bewertet, ob der Prozess seine beabsichtigte Leistung erreicht. Dabei werden nicht nur Einzelfehler, sondern wiederkehrende Entwicklungen betrachtet.'},
        {start:75,end:90,visual:'p4-improve',kicker:'5 · Verbessern',title:'Erkenntnisse verändern den nächsten Durchlauf',caption:'Verbesserung beendet den Kreislauf nicht – sie wird zur neuen Grundlage.',narration:'Aus der Bewertung folgen geeignete Verbesserungen. Danach wird erneut beobachtet. Merke: Prozessmanagement hält einen Prozess durch wiederholtes Festlegen, Umsetzen, Bewerten und Weiterentwickeln wirksam.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-05', moduleId:'prozess', number:22, pathNumber:5, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 5', title:'Für wen und wofür läuft der Prozess?',
      summary:'Kundenbedürfnisse und Unternehmensziele als zwei verbindliche Richtungen der Prozessgestaltung zusammenführen.',
      topics:['Kundenbedürfnisse','Unternehmensziele','Prozessausrichtung','Gemeinsamer Zielbeitrag'],
      source:'TÜV Modul 1, Abschnitt 3.2 „Prozessmanagement nach ISO 9001“',
      sourceNote:'Dieses Video behandelt ausschließlich die doppelte Ausrichtung eines Prozesses. Anforderungen interessierter Parteien im ISO-Prozessmodell folgen erst in Video 9.',
      scenes:[
        {start:0,end:8,visual:'p5-intro',kicker:'Lernpfad 2 · Kurzvideo 5',title:'Für wen und wofür läuft der Prozess?',caption:'Ein beherrschter Ablauf muss zum Kundenbedarf und zur Richtung der Organisation passen.',narration:'Ein Prozess kann technisch sauber laufen und trotzdem am Ziel vorbeigehen. Deshalb braucht er zwei Richtungen: Kunde und Unternehmen.'},
        {start:8,end:21,visual:'p5-customer',kicker:'Richtung 1 · Kundenbedürfnis',title:'Welchen Nutzen erwartet der Empfänger?',caption:'Der Prozess muss ein Ergebnis hervorbringen, das die vereinbarte Kundenleistung unterstützt.',narration:'Die Kundenseite fragt: Welcher Nutzen wird erwartet? Bei CARAT gehören dazu spezifikationsgerechte Ware, vollständige Mengen und ein verlässlicher Liefertermin.'},
        {start:21,end:34,visual:'p5-company',kicker:'Richtung 2 · Unternehmensziel',title:'Welchen Beitrag soll der Prozess für CARAT leisten?',caption:'Prozesse müssen ebenso zur strategischen und wirtschaftlichen Richtung der Organisation beitragen.',narration:'Die Unternehmensseite fragt: Welchen eigenen Zielbeitrag soll der Ablauf leisten? Das können stabile Prozessleistung, geringe Verluste und verlässliche Lieferfähigkeit sein.'},
        {start:34,end:47,visual:'p5-misaligned',kicker:'Einseitig gut reicht nicht',title:'Schnell gearbeitet – Kundenbedarf verfehlt',caption:'Ein kurzer Ablauf ist kein Erfolg, wenn die falsche Gebindegröße zum falschen Termin bereitsteht.',narration:'Effizienz allein genügt nicht. Ein besonders schneller Prozess ist wirkungslos, wenn sein Ergebnis nicht zur Bestellung passt oder der zugesagte Termin verfehlt wird.'},
        {start:47,end:61,visual:'p5-carat',kicker:'CARAT-Zielbild',title:'Kundennutzen und Unternehmensnutzen treffen sich',caption:'Richtige Ware pünktlich liefern und dabei Ausschuss sowie unnötige Wartezeit begrenzen.',narration:'Gut ausgerichtet ist der Prozess, wenn CARAT die richtige Ware pünktlich liefert und gleichzeitig Material, Zeit und verfügbare Kapazität verantwortungsvoll einsetzt.'},
        {start:61,end:76,visual:'p5-filter',kicker:'Filter für Prozessentscheidungen',title:'Verbessert die Änderung beide Zielrichtungen?',caption:'Jede Prozessänderung wird auf Kundennutzen und Unternehmensbeitrag geprüft.',narration:'Vor einer Änderung helfen zwei Prüfungen: Unterstützt sie die erwartete Kundenleistung? Und stärkt sie die vereinbarten Unternehmensziele? Eine einseitige Optimierung wird dadurch sichtbar.'},
        {start:76,end:90,visual:'p5-recap',kicker:'Ausrichtungs-Merksatz',title:'Der Prozess verbindet Bedarf und Ziel',caption:'Kundenbedürfnis bestimmt den erwarteten Nutzen · Unternehmensziel bestimmt den erforderlichen Beitrag.',narration:'Merke: Der Kunde gibt nicht allein den Ablauf vor, und das Unternehmen darf nicht am Kunden vorbeiplanen. Der Prozess verbindet beide Richtungen in einem gemeinsamen Ergebnis.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-06', moduleId:'prozess', number:23, pathNumber:6, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 6', title:'Was macht einen Prozess wirklich steuerbar?',
      summary:'Methode, Leistungsindikator, Ressourcen, Verantwortung und Befugnis als getrennte Lenkungsbedingungen anwenden.',
      topics:['Methode','Leistungsindikator','Ressourcen','Verantwortung','Befugnisse'],
      source:'TÜV Modul 1, Abschnitt 3.2; DIN EN ISO 9001:2015, Abschnitt 4.4',
      sourceNote:'Risiken, Änderungen und Verbesserungen werden hier nicht vertieft. Der Schwerpunkt liegt ausschließlich auf den Bedingungen für Durchführung, Beobachtung und Entscheidung.',
      scenes:[
        {start:0,end:8,visual:'p6-intro',kicker:'Lernpfad 2 · Kurzvideo 6',title:'Was macht einen Prozess wirklich steuerbar?',caption:'Ein Ziel allein genügt nicht: Durchführung, Beobachtung und Entscheidungen brauchen klare Bedingungen.',narration:'Ein Prozess wird steuerbar, wenn Methode, Leistungsindikator, Ressourcen, Verantwortung und Befugnisse eindeutig zusammenwirken.'},
        {start:8,end:21,visual:'p6-method',kicker:'1 · Methode',title:'Wie soll die Tätigkeit durchgeführt werden?',caption:'Das vereinbarte Vorgehen verhindert, dass jede Schicht denselben Prozess anders ausführt.',narration:'Die Methode beschreibt das vorgesehene Vorgehen. Bei CARAT legt sie beispielsweise fest, wie die Füllmenge geprüft und ein Messergebnis behandelt wird.'},
        {start:21,end:34,visual:'p6-kpi',kicker:'2 · Leistungsindikator',title:'Woran wird Prozessleistung erkennbar?',caption:'Ein geeigneter Indikator verdichtet Beobachtungen zu einer bewertbaren Aussage.',narration:'Ein Leistungsindikator macht Entwicklung sichtbar. Die Quote korrekt gefüllter Packungen zeigt zuverlässiger als ein einzelner Beutel, wie stabil die Abfüllung arbeitet.'},
        {start:34,end:47,visual:'p6-resources',kicker:'3 · Ressourcen',title:'Welche Mittel müssen verfügbar sein?',caption:'Personal, Zeit, Anlage, Messmittel und Information sichern die geplante Durchführung.',narration:'Ressourcen beantworten die Frage, was für die Durchführung benötigt wird. Fehlen geeignete Mitarbeitende, Zeit oder eine funktionsfähige Waage, bleibt die beste Methode wirkungslos.'},
        {start:47,end:60,visual:'p6-responsibility',kicker:'4 · Verantwortung',title:'Wer trägt den Ablauf und reagiert auf Abweichungen?',caption:'Verantwortung ordnet dem Prozess eine verlässlich zuständige Rolle zu.',narration:'Verantwortung bestimmt, wer den Prozess beobachtet, Ergebnisse bewertet und notwendige Reaktionen veranlasst. Damit bleibt eine Abweichung nicht zwischen Bereichen liegen.'},
        {start:60,end:74,visual:'p6-authority',kicker:'5 · Befugnis',title:'Wer darf tatsächlich entscheiden?',caption:'Verantwortung ohne Entscheidungsrecht kann einen kritischen Prozess nicht wirksam lenken.',narration:'Befugnis ergänzt die Verantwortung. Wer bei einer Gewichtsabweichung die Linie stoppen oder Ware sperren soll, benötigt dafür ein eindeutig erteiltes Entscheidungsrecht.'},
        {start:74,end:90,visual:'p6-recap',kicker:'Prozess-Cockpit',title:'Methode, Indikator, Ressourcen, Verantwortung und Befugnis',caption:'Erst das Zusammenspiel macht Durchführung, Beobachtung und Reaktion verlässlich.',narration:'Merke: Methode sagt wie. Indikator zeigt wie gut. Ressourcen ermöglichen die Arbeit. Verantwortung benennt wer handelt. Befugnis klärt wer entscheiden darf.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-07', moduleId:'prozess', number:24, pathNumber:7, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 7', title:'Wo beginnt und endet ein Prozess?',
      summary:'Prozessgrenzen, Zweck, Ergebnis, Empfänger und Schnittstelle für eine sichere Übergabe festlegen.',
      topics:['Prozessanfang','Prozessende','Zweck und Ergebnis','Interner oder externer Empfänger','Schnittstelle'],
      source:'TÜV Modul 1, Abschnitt 3.3 „Identifikation von Prozessen“',
      sourceNote:'Die Reihenfolge innerer Aktivitäten aus Video 3 wird nicht wiederholt. Dieses Video betrachtet ausschließlich Abgrenzung und Übergabe zwischen Prozessen.',
      scenes:[
        {start:0,end:8,visual:'p7-intro',kicker:'Lernpfad 2 · Kurzvideo 7',title:'Wo beginnt und endet ein Prozess?',caption:'Einzelprozesse dürfen nicht isoliert betrachtet werden – ihre Ergebnisse wandern durch das Unternehmen.',narration:'Unternehmensleistung entsteht aus vielen verbundenen Prozessen. Damit ihr Zusammenspiel funktioniert, braucht jeder Prozess erkennbare Grenzen und eine klare Übergabe.'},
        {start:8,end:21,visual:'p7-boundary',kicker:'Prozess abgrenzen',title:'Ein auslösendes Ereignis und ein definiertes Ende',caption:'Der Anfang benennt, wodurch der Prozess startet; das Ende, wann sein Auftrag erfüllt ist.',narration:'Die Abgrenzung legt Anfang und Ende fest. Bei CARAT kann der Prozess mit einem freigegebenen Produktionsauftrag beginnen und mit bereitgestellter, geprüfter Ware enden.'},
        {start:21,end:34,visual:'p7-purpose',kicker:'Zweck und Ergebnis',title:'Warum existiert der Prozess – und was liefert er?',caption:'Der Zweck beschreibt den Nutzen; das Ergebnis macht diesen Nutzen für die Übergabe konkret.',narration:'Zusätzlich werden Zweck und Ergebnis bestimmt. Der Zweck erklärt den beabsichtigten Beitrag. Das Ergebnis beschreibt konkret, was nach Abschluss verfügbar sein muss.'},
        {start:34,end:47,visual:'p7-recipient',kicker:'Empfänger dokumentieren',title:'Wer benötigt das Ergebnis als Nächstes?',caption:'Empfänger können ein nachfolgender interner Bereich oder ein externer Kunde sein.',narration:'Zu jedem Ergebnis gehört ein Empfänger. Intern kann die Bereitstellung an den Versandbereich gehen. Extern erhält beispielsweise der Großhändler die vereinbarte Lieferung.'},
        {start:47,end:61,visual:'p7-interface',kicker:'Die Schnittstelle',title:'Ein Ergebnis wird zur Eingabe des Folgeprozesses',caption:'Genau an dieser Übergabestelle treffen zwei getrennte Prozesse aufeinander.',narration:'An der Schnittstelle wird das Ergebnis eines Prozesses zur Eingabe des nächsten. Dort müssen Inhalt, Zustand, Zeitpunkt und Verantwortung der Übergabe eindeutig zusammenpassen.'},
        {start:61,end:76,visual:'p7-handover',kicker:'CARAT-Übergabe',title:'Geprüfte Ware trifft auf Versandauftrag',caption:'Nur identifizierte Charge, richtige Menge und dokumentierte Freigabe dürfen weitergegeben werden.',narration:'Eine saubere CARAT-Übergabe verbindet bereitgestellte Ware mit Charge, Menge und Freigabestatus. Fehlt eine Information, beginnt der Folgeprozess mit einer unsicheren Eingabe.'},
        {start:76,end:90,visual:'p7-recap',kicker:'Schnittstellen-Merksatz',title:'Grenze festlegen – Empfänger kennen – Übergabe sichern',caption:'Anfang und Ende schaffen Klarheit; die Schnittstelle verbindet den Prozess mit dem nächsten.',narration:'Merke: Prozessgrenzen trennen Verantwortungsbereiche, Schnittstellen verbinden ihre Ergebnisse. Eine Übergabe ist erst vollständig, wenn der Empfänger sie verlässlich nutzen kann.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-08', moduleId:'prozess', number:25, pathNumber:8, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 8', title:'Kern-, Unterstützungs- oder Führungsprozess?',
      summary:'Die drei Prozessarten nach direkter Wertschöpfung, unterstützender Wirkung und Unternehmenssteuerung unterscheiden.',
      topics:['Kernprozesse','Unterstützende Prozesse','Führungsprozesse','Prozessübersicht'],
      source:'TÜV Modul 1, Abschnitt 3.3 und Abbildung 10 „Prozessübersicht einer Organisation“',
      sourceNote:'Dieses Video ordnet Prozessarten. Einzelne Prozessgrenzen und Übergabekriterien bleiben ausschließlich Thema von Video 7.',
      scenes:[
        {start:0,end:8,visual:'p8-intro',kicker:'Lernpfad 2 · Kurzvideo 8',title:'Kern-, Unterstützungs- oder Führungsprozess?',caption:'Eine Prozessübersicht zeigt nicht nur Abläufe, sondern deren unterschiedliche Beiträge zum Unternehmen.',narration:'Nachdem Prozesse erkannt sind, werden sie zur Übersicht in drei Arten gegliedert: Kern-, unterstützende sowie System- und Führungsprozesse.'},
        {start:8,end:22,visual:'p8-core',kicker:'Kernprozess',title:'Direkter Beitrag zur Wertschöpfung',caption:'Kernprozesse beginnen beim Kundenbedarf und führen zur Leistung für den Kunden.',narration:'Kernprozesse sind für Wertschöpfung und Geschäftserfolg entscheidend. Bei CARAT reicht die zentrale Kette vom Kundenauftrag über die Herstellung bis zur bereitgestellten Lieferung.'},
        {start:22,end:36,visual:'p8-support',kicker:'Unterstützender Prozess',title:'Indirekt wertschöpfend – für den Kernprozess unverzichtbar',caption:'Beschaffung, Instandhaltung oder Prüfmittelüberwachung sichern den reibungslosen Ablauf.',narration:'Unterstützende Prozesse erzeugen den Kundennutzen nicht unmittelbar. Sie stellen jedoch Voraussetzungen bereit, ohne die der Kernprozess nicht zuverlässig funktionieren könnte.'},
        {start:36,end:50,visual:'p8-leadership',kicker:'System- und Führungsprozess',title:'Richtung geben und Organisation steuern',caption:'Politik, Strategie, Budget, Personalentwicklung und Zielmanagement führen das Unternehmen.',narration:'Führungsprozesse bestimmen Richtung und Rahmen. Dazu gehören beispielsweise Strategie, Zielmanagement, Budgetierung und Personalentwicklung. Sie lenken, wohin sich die Organisation entwickelt.'},
        {start:50,end:63,visual:'p8-landscape',kicker:'Zusammenwirken',title:'Der Kernstrom wird getragen und gesteuert',caption:'Unterstützung wirkt von unten auf den Kernprozess; Führung richtet ihn von oben aus.',narration:'In der Prozessübersicht steht der Kernstrom zwischen Kunde und Kunde. Unterstützende Prozesse sichern seine Funktionsfähigkeit, während Führungsprozesse Ziele und Orientierung vorgeben.'},
        {start:63,end:77,visual:'p8-classify',kicker:'Richtig einordnen',title:'Nicht der Abteilungsname entscheidet',caption:'Entscheidend ist, welchen Beitrag der konkrete Prozess für Wertschöpfung, Unterstützung oder Führung leistet.',narration:'Ein Bereich kann an mehreren Prozessarten beteiligt sein. Ordne deshalb nicht nach Organigramm, sondern nach der tatsächlichen Wirkung des betrachteten Prozesses.'},
        {start:77,end:90,visual:'p8-recap',kicker:'Prozessarten-Merksatz',title:'Kern schafft Wert · Unterstützung ermöglicht · Führung richtet aus',caption:'Erst alle drei Prozessarten zusammen machen die Organisation funktionsfähig.',narration:'Merke: Kernprozesse schaffen direkten Kundennutzen. Unterstützende Prozesse ermöglichen ihn. Führungsprozesse geben Richtung. Keine der drei Arten wirkt allein.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-09', moduleId:'prozess', number:26, pathNumber:9, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 9', title:'Wie liest man das Prozessmodell der ISO 9001?',
      summary:'Anforderungen, Normabschnitte, Ergebnisse und Kundenzufriedenheit als zusammenhängendes QMS-Modell einordnen.',
      topics:['Prozessorientierter Ansatz','Eingangsseite des Modells','Normabschnitte 4 bis 10','Ergebnisse des QMS','Kundenzufriedenheit'],
      source:'TÜV Modul 1, Abschnitt 3.4 und Abbildung 11 „Prozessmodell der ISO 9001“; DIN EN ISO 9001:2015, Abschnitt 0.3',
      sourceNote:'Das Modell zeigt die Verknüpfung der Normanforderungen und keine konkrete betriebliche Prozesslandkarte. PDCA wird erst in Video 10 vollständig erklärt.',
      scenes:[
        {start:0,end:8,visual:'p9-intro',kicker:'Lernpfad 2 · Kurzvideo 9',title:'Wie liest man das Prozessmodell der ISO 9001?',caption:'Die Normanforderungen bilden ein verbundenes System – keine lose Sammlung einzelner Kapitel.',narration:'Das Prozessmodell zeigt, wie die Abschnitte der ISO 9001 als zusammenhängendes Qualitätsmanagementsystem gelesen werden können.'},
        {start:8,end:21,visual:'p9-not-map',kicker:'Wichtige Abgrenzung',title:'Normmodell ist keine betriebliche Prozesslandkarte',caption:'Es enthält alle Anforderungen der Norm, stellt aber keine einzelnen CARAT-Arbeitsprozesse dar.',narration:'Das Bild ist keine Prozesslandkarte eines Unternehmens. Es zeigt nicht Abfüllung oder Versand, sondern die systematische Verknüpfung der Normanforderungen.'},
        {start:21,end:34,visual:'p9-inputs',kicker:'Eingangsseite',title:'Kontext, Kundenanforderungen und interessierte Parteien',caption:'Diese Anforderungen und Rahmenbedingungen beeinflussen, was das QMS leisten muss.',narration:'Links stehen wesentliche Eingänge: der Kontext der Organisation, Kundenanforderungen und Erwartungen relevanter interessierter Parteien. Sie prägen die Ausgestaltung des Systems.'},
        {start:34,end:49,visual:'p9-sections',kicker:'Im System',title:'Die Normabschnitte 4 bis 10 wirken zusammen',caption:'Kontext, Führung, Planung, Unterstützung, Betrieb, Bewertung und Verbesserung bilden ein verbundenes Ganzes.',narration:'Im Modell greifen die Abschnitte vier bis zehn ineinander. Führung und Planung geben Richtung, Unterstützung und Betrieb setzen um, Bewertung und Verbesserung entwickeln das System weiter.'},
        {start:49,end:63,visual:'p9-outputs',kicker:'Ergebnisse des QMS',title:'Mehr als Produkte und Dienstleistungen',caption:'Zur Ausgangsseite gehört auch die erreichte und überwachte Kundenzufriedenheit.',narration:'Rechts erscheinen die Ergebnisse. Dazu zählen konforme Produkte und Dienstleistungen sowie die erreichte Kundenzufriedenheit. Diese Zufriedenheit muss entsprechend überwacht werden.'},
        {start:63,end:77,visual:'p9-reading',kicker:'Leserichtung',title:'Anforderungen hinein – Systemwirkung heraus',caption:'Rückmeldungen zu Ergebnissen fließen wieder in Bewertung und Verbesserung ein.',narration:'Lies das Modell von den Anforderungen über das verbundene System zu den Ergebnissen. Erkenntnisse über die Wirkung bleiben nicht am Ausgang stehen, sondern beeinflussen die weitere Lenkung.'},
        {start:77,end:90,visual:'p9-recap',kicker:'Modell-Merksatz',title:'Die Normkapitel arbeiten als ein System',caption:'Das Prozessmodell verbindet Eingänge, QMS-Anforderungen und Ergebnisse – ohne Einzelprozesse vorzuschreiben.',narration:'Merke: Das ISO-Prozessmodell ordnet Normanforderungen zu einem System. Es zeigt Zusammenhänge, schreibt aber keine konkrete Prozesslandschaft für CARAT vor.'}
      ]
    },
    {
      id:'lernpfad-2-prozesse-kurzvideo-10', moduleId:'prozess', number:27, pathNumber:10, duration:90,
      chapter:'Lernpfad 2 · Prozesse & PDCA', section:'Kurzvideo 10', title:'Wie lenkt PDCA das gesamte Prozesssystem?',
      summary:'Plan, Do, Check und Act auf das QMS und seine Teilprozesse als geschlossenen Lernkreislauf anwenden.',
      topics:['Plan','Do','Check','Act','System- und Teilprozessebene'],
      source:'TÜV Modul 1, Abschnitt 3.4; DIN EN ISO 9001:2015, Abschnitt 0.3.2',
      sourceNote:'Das ISO-Prozessmodell aus Video 9 wird nicht erneut erklärt. Dieses Video konzentriert sich ausschließlich auf die vier PDCA-Phasen und ihre systematische Rückkopplung.',
      scenes:[
        {start:0,end:8,visual:'p10-intro',kicker:'Lernpfad 2 · Kurzvideo 10',title:'Wie lenkt PDCA das gesamte Prozesssystem?',caption:'Plan, Do, Check und Act verbinden Planung, Umsetzung, Bewertung und Verbesserung.',narration:'Zum Abschluss von Kapitel drei betrachten wir PDCA als Lenkungsprinzip für das gesamte Qualitätsmanagementsystem und seine Teilprozesse.'},
        {start:8,end:23,visual:'p10-plan',kicker:'PLAN · Planen',title:'Ziele, Ressourcen, Anforderungen sowie Risiken und Chancen berücksichtigen',caption:'Planung legt fest, welche Ergebnisse in Übereinstimmung mit Kundenanforderungen und Politik erreicht werden sollen.',narration:'Plan bedeutet: Ziele und benötigte Ressourcen festlegen, Kundenanforderungen und Politik berücksichtigen sowie Risiken und Chancen ermitteln und angemessen behandeln.'},
        {start:23,end:36,visual:'p10-do',kicker:'DO · Durchführen',title:'Das Geplante unter realen Bedingungen umsetzen',caption:'Vereinbarte Tätigkeiten werden mit den vorgesehenen Mitteln tatsächlich ausgeführt.',narration:'Do bedeutet: das Geplante umsetzen. Bei CARAT läuft der festgelegte Abfüllprozess mit den vorgesehenen Vorgaben, Mitarbeitenden und Arbeitsmitteln.'},
        {start:36,end:51,visual:'p10-check',kicker:'CHECK · Prüfen',title:'Prozesse und Ergebnisse überwachen und bewerten',caption:'Messungen werden mit Politik, Zielen, Anforderungen und geplanten Tätigkeiten verglichen und berichtet.',narration:'Check bedeutet: Prozesse sowie resultierende Produkte und Dienstleistungen überwachen, gegebenenfalls messen, mit den Vorgaben vergleichen und über die Ergebnisse berichten.'},
        {start:51,end:65,visual:'p10-act',kicker:'ACT · Handeln',title:'Notwendige Maßnahmen verbessern die Leistung',caption:'Erkenntnisse aus der Prüfung werden in wirksame Veränderungen überführt.',narration:'Act bedeutet: Maßnahmen ergreifen, soweit sie zur Verbesserung der Leistung notwendig sind. Eine erkannte Schwachstelle führt damit zu einer bewusst veränderten nächsten Planung.'},
        {start:65,end:78,visual:'p10-carat',kicker:'CARAT im Kreislauf',title:'Füllmengen planen, abfüllen, auswerten und nachsteuern',caption:'Das Beispiel durchläuft alle vier Phasen, ohne an der Kontrolle stehenzubleiben.',narration:'CARAT plant die Füllmengensicherheit, führt die Abfüllung durch, wertet Abweichungen aus und passt den Prozess gezielt an. Danach beginnt der nächste verbesserte Durchlauf.'},
        {start:78,end:90,visual:'p10-recap',kicker:'PDCA-Merksatz',title:'Planen → Durchführen → Prüfen → Handeln → neu planen',caption:'PDCA ist kein Kreis ohne Fortschritt, sondern wiederholtes Lernen auf System- und Prozessebene.',narration:'Merke: PDCA schließt die Rückkopplung. Erkenntnisse verändern den nächsten Plan und entwickeln so das System sowie seine Teilprozesse fortlaufend weiter.'}
      ]
    }
  ];

  const PUBLISHED_VIDEO_GUIDES = VIDEO_GUIDES.filter(guide => !guide.draft);

  const CHAPTER_2_VIDEO_STATIONS = [
    {
      id:'begriffe', section:'2.1', title:'Begriffe und Definitionen',
      description:'Qualitätsbegriff, Anforderungen, Kundenzufriedenheit und die Bausteine des Qualitätsmanagements visuell einordnen.',
      videoNumbers:[11,1,12,5,6,7,8]
    },
    {
      id:'qualitaetsmanagement', section:'2.2', title:'Qualitätsmanagement',
      description:'Entwicklung des Qualitätsdenkens, Managementgrundsätze und heutige Betrachtungsebenen verständlich verknüpfen.',
      videoNumbers:[9,15,10,16]
    },
    {
      id:'managementsystem', section:'2.3', title:'Qualitätsmanagementsysteme',
      description:'Aufbau, Organisation und wirtschaftlichen Nutzen eines QMS anhand klarer Zusammenhänge erkennen.',
      videoNumbers:[13,14,4,17]
    },
    {
      id:'iso-transfer', section:'ISO-Ergänzung', title:'Prüfungsrelevante Vertiefung', supplement:true,
      description:'Zwei zentrale ISO-Prüfungsbegriffe ergänzen Kapitel 2, ohne Inhalte der drei TÜV-Abschnitte zu verdoppeln.',
      videoNumbers:[2,3]
    }
  ];

  const CHAPTER_3_VIDEO_STATIONS = [
    {id:'prozessbegriff',section:'3.1',title:'Was ist ein Prozess?',description:'Prozessbausteine, Produktions- und Dienstleistungsprozesse sowie sequentielle und parallele Aktivitäten visuell unterscheiden.',videoNumbers:[18,19,20]},
    {id:'prozessmanagement',section:'3.2',title:'Prozessmanagement nach ISO 9001',description:'Lenkungskreislauf, doppelte Zielausrichtung und die Bedingungen eines steuerbaren Prozesses verbinden.',videoNumbers:[21,22,23]},
    {id:'prozessidentifikation',section:'3.3',title:'Identifikation von Prozessen',description:'Grenzen, Empfänger, Schnittstellen und die drei Prozessarten in einer Prozessübersicht einordnen.',videoNumbers:[24,25]},
    {id:'iso-prozessmodell',section:'3.4',title:'Prozessmodell ISO 9001',description:'Das zusammenhängende Normmodell lesen und das gesamte Prozesssystem mit PDCA lenken.',videoNumbers:[26,27]}
  ];

  const LEARNING_PATH_VIDEO_CONFIG = {
    grundlagen:{chapter:'ISO-Grundlagen',title:'Visuelle Ergänzungen zu ISO 9000',intro:'Die kurzen Videos visualisieren zentrale Qualitätsbegriffe und Grundzusammenhänge.',stations:CHAPTER_2_VIDEO_STATIONS},
    prozess:{chapter:'QM Modul 1 · Prozessmanagement',title:'Visuelle Ergänzungen zum Prozessmanagement',intro:'Die zehn Kurzvideos ergänzen die Prozessdefinition, Prozessarten und die Lenkung des gesamten Systems.',stations:CHAPTER_3_VIDEO_STATIONS}
  };

  const ALL_VIDEO_STATIONS = [...CHAPTER_2_VIDEO_STATIONS, ...CHAPTER_3_VIDEO_STATIONS];

  const OPEN_BOOK_MODULES = {
    iso: {
      title: 'ISO-Lernmodul', short: 'Freitextfragen mit externer Recherche in der ISO-Unterlage', document: 'ISO-Unterlage',
      questions: [
        {id:'iso-1', prompt:'Welche Anforderungen stellt ISO 9001 an Qualitätsziele? Formuliere die wesentlichen Merkmale vollständig.', source:'DIN EN ISO 9001:2015, Abschnitt 6.2.1', hints:['qualitätspolitik','messbar','überwacht','vermittelt','aktualisiert'], min:4},
        {id:'iso-2', prompt:'Welche Punkte sind bei der Planung zum Erreichen von Qualitätszielen festzulegen?', source:'DIN EN ISO 9001:2015, Abschnitt 6.2.2', hints:['was','ressourcen','verantwortlich','wann','bewertet'], min:4},
        {id:'iso-3', prompt:'Welche Aspekte sind beim Erstellen und Aktualisieren dokumentierter Information sicherzustellen?', source:'DIN EN ISO 9001:2015, Abschnitt 7.5.2', hints:['kennzeichnung','format','medium','überprüfung','genehmigung'], min:4},
        {id:'iso-4', prompt:'Welche Anforderungen gelten für die Lenkung dokumentierter Information?', source:'DIN EN ISO 9001:2015, Abschnitt 7.5.3', hints:['verfügbar','geeignet','geschützt','verteilung','zugriff','aufbewahrung'], min:4},
        {id:'iso-5', prompt:'Welche Anforderungen stellt ISO 9001 an das interne Auditprogramm?', source:'DIN EN ISO 9001:2015, Abschnitt 9.2.2', hints:['häufigkeit','methoden','verantwortlichkeiten','planung','berichterstattung','risiken'], min:4},
        {id:'iso-6', prompt:'Welche Schritte verlangt ISO 9001 beim Auftreten einer Nichtkonformität?', source:'DIN EN ISO 9001:2015, Abschnitt 10.2.1', hints:['reagieren','ursache','wiederholung','maßnahmen','wirksamkeit','risiken'], min:4}
      ]
    },
    modul1: {
      title: 'TÜV Modul 1 Lernmodul', short: 'Freitextfragen mit externer Recherche im TÜV-Skript Modul 1', document: 'TÜV Modul 1',
      questions: [
        {id:'m1-1', prompt:'Welche Elemente helfen dabei, Prozesse zu identifizieren, zu gliedern und voneinander abzugrenzen?', source:'QM Modul 1, Kapitel 1.2 „Prozesse erkennen und systematisieren“, Skriptseiten 10–21', hints:['eingabe','ergebnis','lieferant','kunde','prozesseigner'], min:3},
        {id:'m1-2', prompt:'Welche Darstellungen und Prüffragen eignen sich, um einen Prozess zu visualisieren und zu analysieren?', source:'QM Modul 1, Kapitel 1.3 „Prozesse visualisieren und analysieren“, Skriptseiten 22–29', hints:['ablauf','schnittstellen','tätigkeiten','verantwortung','analyse'], min:3},
        {id:'m1-3', prompt:'Wie tragen Prozessregelkreise und Kennzahlen zur Beherrschung eines Prozesses bei?', source:'QM Modul 1, Kapitel 1.4 „Prozesse beherrschen“, Skriptseiten 30–38', hints:['ziel','messung','regelgröße','abweichung','steuerung'], min:3},
        {id:'m1-4', prompt:'Worin unterscheiden sich Ursache-Wirkungs-Diagramm und Pareto-Diagramm bei der Problemanalyse?', source:'QM Modul 1, Kapitel 2.1 „Anwendung der Standardwerkzeuge“, Skriptseiten 68–100', hints:['ursachen','wirkung','häufigkeit','priorität','analyse'], min:3},
        {id:'m1-5', prompt:'Welche Ziele, Schritte und Rollen kennzeichnen eine FMEA?', source:'QM Modul 1, Kapitel 3.2 „Fehlermöglichkeits- und Einflussanalyse“, Skriptseiten 143–169', hints:['risiko','fehler','folge','ursache','maßnahme'], min:4},
        {id:'m1-6', prompt:'Welche Aufgaben erfüllen die fünf Phasen des DMAIC-Zyklus?', source:'QM Modul 1, Kapitel 5.5 „DMAIC-Zyklus“, Skriptseiten 280–305', hints:['define','measure','analyze','improve','control'], min:5}
      ]
    },
    modul2: {
      title: 'TÜV Modul 2 Lernmodul', short: 'Freitextfragen mit externer Recherche im TÜV-Skript Modul 2', document: 'TÜV Modul 2',
      questions: [
        {id:'m2-1', prompt:'Wie gliedert das EFQM Modell 2025 Ausrichtung, Realisierung und Ergebnisse?', source:'QM Modul 2, Kapitel 3 „Das EFQM Modell 2025“, Skriptseiten 15–33', hints:['ausrichtung','realisierung','ergebnisse','radar'], min:3},
        {id:'m2-2', prompt:'Welche Perspektiven umfasst die Balanced Scorecard und wie wirken sie zusammen?', source:'QM Modul 2, Kapitel 4 „Balanced Scorecard“, Skriptseiten 34–42', hints:['finanzen','kunden','prozesse','lernen','ursache'], min:4},
        {id:'m2-3', prompt:'Welche Phasen umfasst ein vollständiger Benchmarking-Prozess?', source:'QM Modul 2, Kapitel 5 „Benchmarking“, Skriptseiten 43–48', hints:['planung','partner','daten','vergleich','maßnahme'], min:3},
        {id:'m2-4', prompt:'Warum reicht bei einer Nichtkonformität die unmittelbare Fehlerkorrektur allein nicht aus?', source:'QM Modul 2, Kapitel 6.3 „Umgang mit Nichtkonformitäten“, Skriptseiten 60–75', hints:['ursache','wiederholung','korrekturmaßnahme','wirksamkeit'], min:3},
        {id:'m2-5', prompt:'Welche Ziele und Gestaltungselemente gehören zu wirksamer Mitarbeiterorientierung?', source:'QM Modul 2, Kapitel 7 „Mitarbeiterorientierung“, Skriptseiten 82–88', hints:['qualifizierung','führung','gespräch','befragung','beteiligung'], min:3},
        {id:'m2-6', prompt:'Welche organisatorischen Strategien helfen, Produkt- und Produzentenhaftung zu vermeiden?', source:'QM Modul 2, Kapitel 9–11 „Recht, Haftung und Schadensvermeidung“, Skriptseiten 92–160', hints:['organisation','dokumentation','vertrag','produktbeobachtung','qualitätssicherung'], min:4}
      ]
    }
  };

  function normalizeOpenBookAnswer(value='') {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß]+/g,' ');
  }
  function currentOpenBookQuestion() {
    const module = OPEN_BOOK_MODULES[state.openBookSource];
    return module?.questions?.[state.openBookIndex] || null;
  }
  function openBookQuestionStats(id) {
    return store.openBookProgress?.[id] || {attempts:0, correct:0, lastAt:null};
  }
  function openBookDifficultyLabel(level) {
    return level === 'easy' ? 'Leicht' : level === 'normal' ? 'Normal' : 'Schwer';
  }
  function openBookUpperChapter(q) {
    const src = String(q.source || '');
    const m = src.match(/(?:Kapitel|Abschnitt)\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (m) return `Oberkapitel ${m[1].split('.')[0]}`;
    return src.split(',')[0] || 'Themengebiet des Dokuments';
  }
  function openBookHelpText(q, level) {
    if (level === 'hard') return 'Im Schwierigkeitsgrad „Schwer“ ist keine Recherchehilfe vorgesehen.';
    if (level === 'normal') return `Suche im ${openBookUpperChapter(q)}. Die genaue Unterstelle musst du selbst bestimmen.`;
    return `Gezielte Orientierung: ${q.source}. Achte auf die dort vollständig aufgeführten Anforderungen und Bedingungen.`;
  }
  function renderOpenBookHome() {
    const current = state.openBookDifficulty || store.openBookDifficulty || 'easy';
    const cards = Object.entries(OPEN_BOOK_MODULES).map(([id,m]) => {
      const done=m.questions.filter(q=>openBookQuestionStats(q.id).correct>0).length;
      return `<article class="openbook-module-card"><div class="eyebrow">Open-Book-Training</div><h2>${esc(m.title)}</h2><p>${esc(m.short)}</p><div class="path-progress"><span style="width:${done/m.questions.length*100}%"></span></div><div class="path-meta"><span>${done}/${m.questions.length} mindestens einmal gelöst</span></div><button class="primary-btn" data-action="start-openbook" data-source="${id}">${done?'Weiterlernen':'Lernmodul starten'}</button></article>`;
    }).join('');
    app.innerHTML=layout(`<section class="openbook-hero"><div class="eyebrow">Dokumenten-Lerntrainer 10.2</div><h1>Mit deinen eigenen Unterlagen recherchieren, verstehen und formulieren</h1><p class="lead">ISO, TÜV Modul 1 und TÜV Modul 2 arbeiten mit demselben dreistufigen Hilfesystem. Vor dem Start wählst du die passende PDF einmal lokal aus.</p><div class="actions"><button class="secondary-btn" data-action="document-search" data-source="iso">Eigene PDFs einrichten</button></div><div class="difficulty-picker"><h2>Recherchehilfe wählen</h2><div class="difficulty-grid"><button class="difficulty-card ${current==='easy'?'active':''}" data-action="set-openbook-difficulty" data-level="easy"><strong>Leicht</strong><span>Genaue Fundstelle und gezielte Orientierung</span></button><button class="difficulty-card ${current==='normal'?'active':''}" data-action="set-openbook-difficulty" data-level="normal"><strong>Normal</strong><span>Nur Oberkapitel oder Themengebiet</span></button><button class="difficulty-card ${current==='hard'?'active':''}" data-action="set-openbook-difficulty" data-level="hard"><strong>Schwer</strong><span>Keine Hilfe und keine Fundstelle</span></button></div></div><div class="verified-only-note"><strong>Lernregel:</strong> Hinweise lenken nur die Recherche. Sie verraten niemals die vollständige Antwort.</div></section><section class="openbook-grid">${cards}</section>`);
  }
  function renderOpenBookQuestion() {
    const module=OPEN_BOOK_MODULES[state.openBookSource], q=currentOpenBookQuestion();
    if(!module||!q){state.view='openBookHome';render();return;}
    const stats=openBookQuestionStats(q.id), n=state.openBookIndex+1;
    const level=state.openBookDifficulty||store.openBookDifficulty||'easy';
    const saved=store.openBookSavedAnswers?.[q.id]||'';
    const fb=state.openBookFeedback;
    const status=fb ? (fb.ratio>=1?'Vollständig belegt':fb.ratio>=0.75?'Weitgehend belegt':fb.ratio>=0.4?'Teilweise belegt':'Noch nicht ausreichend belegt') : '';
    app.innerHTML=layout(`<section class="openbook-session"><div class="openbook-topline"><div class="eyebrow">${esc(module.title)} · Aufgabe ${n} von ${module.questions.length}</div><span class="difficulty-badge">${openBookDifficultyLabel(level)}</span></div><h1>${esc(q.prompt)}</h1><div class="openbook-instruction"><div><strong>Arbeitsauftrag</strong><p>Öffne deine lokal hinterlegte Unterlage, recherchiere darin und formuliere die wesentlichen Merkmale vollständig in eigenen Worten.</p></div><button class="secondary-btn" type="button" data-action="open-local-document" data-source="${esc(state.openBookSource)}">Eigene PDF öffnen</button></div><form id="openBookForm"><label for="openBookAnswer">Deine Antwort (in eigenen Worten)</label><textarea id="openBookAnswer" rows="8" required autocomplete="off" placeholder="Antwort nach dem Nachschlagen hier eingeben …">${esc(saved)}</textarea><div class="actions"><button class="primary-btn" type="submit">Antwort prüfen</button><button class="secondary-btn" type="button" data-action="openbook-help">Hilfe anzeigen</button><button class="ghost-btn" type="button" data-action="openbook-home">Lernmodul verlassen</button></div></form>${state.openBookHelpVisible?`<div class="openbook-help"><strong>Recherchehilfe · ${openBookDifficultyLabel(level)}</strong><p>${esc(openBookHelpText(q,level))}</p></div>`:''}${fb?`<div class="openbook-feedback ${fb.ratio>=1?'correct':fb.ratio>=0.4?'partial':'wrong'}"><strong>${status}</strong><p>${fb.ratio>=1?'Die zentralen Merkmale wurden erkannt.':`Deine Antwort enthält ${fb.matched} von ${fb.total} hinterlegten Kernelementen. Ergänze sie anhand der Originalunterlagen; fehlende Begriffe werden bewusst nicht genannt.`}</p><div class="competence-row"><span>Erkannt: ${fb.matched}/${fb.total}</span><span>Recherchehilfe: ${openBookDifficultyLabel(level)}</span></div>${fb.ratio<1&&level!=='hard'?`<div class="source-only">${esc(openBookHelpText(q,level))}</div>`:''}<label class="reflection-label">Wie sicher warst du?<select id="openBookConfidence"><option value="">Bitte wählen</option><option value="guessed">Geraten</option><option value="unsure">Eher unsicher</option><option value="sure">Ziemlich sicher</option><option value="very-sure">Völlig sicher</option></select></label><p class="saved-note">✓ Eigene Antwort gespeichert. Du kannst sie ergänzen und erneut prüfen.</p></div>`:''}<div class="path-meta"><span>Bisherige Versuche: ${stats.attempts}</span><span>Erfolgreich: ${stats.correct}</span><span>Hilfen genutzt: ${store.openBookHelpUsage?.[q.id]||0}</span></div>${fb?.ratio>=1?`<div class="transfer-box"><label for="openBookTransfer">Praxis-Transfer: Wie würdest du dieses Wissen im Unternehmen anwenden?</label><textarea id="openBookTransfer" rows="3" placeholder="Kurze eigene Übertragung in die Praxis …">${esc(store.openBookReflections?.[q.id]||'')}</textarea></div><div class="actions"><button class="primary-btn" data-action="next-openbook">Nächste Aufgabe</button></div>`:''}</section>`);
  }
  function checkOpenBookAnswer(value) {
    const q=currentOpenBookQuestion(); if(!q)return;
    const text=normalizeOpenBookAnswer(value);
    const matched=q.hints.filter(h=>text.includes(normalizeOpenBookAnswer(h))).length;
    const total=q.hints.length;
    const ratio=total?matched/total:0;
    const correct=matched>=q.min;
    const old=openBookQuestionStats(q.id);
    store.openBookSavedAnswers[q.id]=value;
    store.openBookProgress[q.id]={attempts:(old.attempts||0)+1,correct:(old.correct||0)+(correct?1:0),lastAt:new Date().toISOString(),source:state.openBookSource,bestRatio:Math.max(old.bestRatio||0,ratio),difficulty:state.openBookDifficulty};
    store.openBookHistory.unshift({id:q.id,source:state.openBookSource,correct,matched,total,ratio,difficulty:state.openBookDifficulty,helpUsed:store.openBookHelpUsage?.[q.id]||0,date:new Date().toISOString(),seconds:state.openBookStartedAt?Math.round((Date.now()-state.openBookStartedAt)/1000):0});
    store.openBookHistory=store.openBookHistory.slice(0,500); saveStore();
    state.openBookFeedback={correct,matched,total,ratio};
    if (registerOpenBookAnswered(q)) return;
    render();
  }

  function startOpenBookSession(options = {}) {
    const source = options.source || 'iso';
    const module = OPEN_BOOK_MODULES[source];
    if (!module) { state.view = 'openBookHome'; render(); return; }
    const firstUnsolved = module.questions.findIndex(q => openBookQuestionStats(q.id).correct === 0);
    const breakEvery = [20,50].includes(Number(options.breakEveryQuestions)) ? Number(options.breakEveryQuestions) : Number(store.breakEveryQuestions || 20);
    state.openBookSource = source;
    state.openBookIndex = firstUnsolved >= 0 ? firstUnsolved : 0;
    state.openBookFeedback = null;
    state.openBookHelpVisible = false;
    state.openBookDifficulty = store.openBookDifficulty || 'easy';
    state.openBookStartedAt = Date.now();
    state.openBookPause = {
      enabled: Boolean(options.breakGameEnabled),
      duration: Number(options.breakDurationMinutes || store.breakDurationMinutes || 3),
      every: breakEvery,
      answered: 0,
      nextAt: breakEvery,
      completedIds: []
    };
    state.pendingSession = null;
    state.view = 'openBookQuestion';
    render();
  }

  function registerOpenBookAnswered(question) {
    const pause = state.openBookPause;
    if (!pause?.enabled || !question) return false;
    if (pause.completedIds.includes(question.id)) return false;
    pause.completedIds.push(question.id);
    pause.answered += 1;
    store.breakAnsweredTotal = Number(store.breakAnsweredTotal || 0) + 1;
    saveStore();
    if (pause.answered < pause.nextAt) return false;
    const moduleIndex = Number(store.breakRotationIndex || 0) % BREAK_MODULES.length;
    state.breakPrompt = {returnView:'openBookQuestion', milestone:pause.nextAt, moduleIndex};
    pause.nextAt += pause.every;
    store.breakRotationIndex = (moduleIndex + 1) % BREAK_MODULES.length;
    saveStore();
    state.view = 'breakPrompt';
    render();
    return true;
  }

  const LEARNING_PATH_MODULES = [
    {id:'grundlagen',order:1,group:'ISO-Normen',title:'ISO 9000 · Grundlagen & Begriffe',short:'Grundbegriffe, QM-Grundsätze und Sprache der Normen',icon:'01',keywords:['qualität','qualitätsmanagement','qms','iso 9000','begriff','grundsatz'],iso:'Primärquelle: DIN EN ISO 9000:2015',m1:'Ergänzung: QM Modul 1 – Prozessbegriffe',m2:'Ergänzung: QM Modul 2 – Führungsmodelle',goal:'Du ordnest Grundbegriffe, Qualitätsmanagementgrundsätze und die Sprache der Normen sicher ein.',impulse:'Welche Begriffe musst du trennscharf erklären können, bevor du Normforderungen bewertest?'},
    {id:'kontext',order:2,group:'ISO-Normen',title:'ISO 9001 · Kapitel 4 – Kontext',short:'Kontext, interessierte Parteien, Anwendungsbereich und QMS',icon:'02',keywords:['kontext','interessierte partei','anwendungsbereich','qms'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 4',m1:'Vertiefung: Prozesslandschaft und Wechselwirkungen',m2:'Transfer: Organisation und nachhaltiger Erfolg',goal:'Du bestimmst Kontext, interessierte Parteien, Anwendungsbereich und QMS-Prozesse.',impulse:'Welche externe Veränderung könnte den Anwendungsbereich deines QMS beeinflussen?'},
    {id:'fuehrung',order:3,group:'ISO-Normen',title:'ISO 9001 · Kapitel 5 – Führung',short:'Leitungsverantwortung, Kundenorientierung, Politik und Rollen',icon:'03',keywords:['oberste leitung','führung','qualitätspolitik','kundenorientierung'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 5',m1:'Vertiefung: Prozesseigner und Verantwortung',m2:'Vertiefung: Unternehmensführung und EFQM',goal:'Du ordnest Verantwortung der Leitung, Kundenorientierung, Politik und Rollen ein.',impulse:'Woran ist Führung für Qualität im betrieblichen Alltag konkret erkennbar?'},
    {id:'planung',order:4,group:'ISO-Normen',title:'ISO 9001 · Kapitel 6 – Planung',short:'Risiken, Chancen, Qualitätsziele und Änderungen',icon:'04',keywords:['risiko','chance','qualitätsziel','änderungsplanung'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 6',m1:'Vertiefung: präventive Planungsmethoden',m2:'Transfer: Strategie und Balanced Scorecard',goal:'Du planst Risiken, Chancen, Qualitätsziele und Änderungen systematisch.',impulse:'Wie wird aus einem Risiko oder einer Chance eine überprüfbare Maßnahme?'},
    {id:'unterstuetzung',order:5,group:'ISO-Normen',title:'ISO 9001 · Kapitel 7 – Unterstützung',short:'Ressourcen, Kompetenz, Kommunikation und Information',icon:'05',keywords:['ressource','kompetenz','kommunikation','dokumentiert','infrastruktur'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 7',m1:'Vertiefung: Daten, Messung und Prozesswissen',m2:'Vertiefung: Mitarbeiter- und Wissensmanagement',goal:'Du beherrschst Ressourcen, Kompetenz, Wissen, Kommunikation und dokumentierte Information.',impulse:'Welche Unterstützung entscheidet darüber, ob ein geplanter Prozess tatsächlich funktioniert?'},
    {id:'betrieb',order:6,group:'ISO-Normen',title:'ISO 9001 · Kapitel 8 – Betrieb',short:'Kundenanforderungen, Entwicklung, Anbieter und Leistungserbringung',icon:'06',keywords:['produkt','dienstleistung','entwicklung','lieferant','freigabe'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 8',m1:'Vertiefung: Planung, Logistik und Service',m2:'Transfer: Haftung und Schadensvermeidung',goal:'Du ordnest betriebliche Anforderungen von der Kundenkommunikation bis zur Freigabe ein.',impulse:'An welchem frühen Punkt lässt sich ein späterer Produktfehler am wirksamsten verhindern?'},
    {id:'bewertung',order:7,group:'ISO-Normen',title:'ISO 9001 · Kapitel 9 – Bewertung',short:'Überwachung, Analyse, Kundenzufriedenheit und Managementbewertung',icon:'07',keywords:['überwachung','messung','kundenzufriedenheit','managementbewertung'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 9',m1:'Vertiefung: Kennzahlen und statistische Auswertung',m2:'Transfer: EFQM-Ergebnisse und Benchmarking',goal:'Du beurteilst Überwachung, Analyse, Kundenzufriedenheit und Managementbewertung.',impulse:'Welche Daten belegen Wirksamkeit und welche sehen nur beeindruckend aus?'},
    {id:'verbesserung',order:8,group:'ISO-Normen',title:'ISO 9001 · Kapitel 10 – Verbesserung',short:'Nichtkonformität, Korrektur und fortlaufende Verbesserung',icon:'08',keywords:['nichtkonform','korrektur','verbesserung','ursache'],iso:'Primärquelle: DIN EN ISO 9001:2015, Kapitel 10',m1:'Vertiefung: Prozessverbesserung und Six Sigma',m2:'Vertiefung: Kaizen, KVP und 8D',goal:'Du unterscheidest Nichtkonformität, Korrektur, Ursache und wirksame Korrekturmaßnahme.',impulse:'Warum ist das Beseitigen eines Fehlers noch keine nachhaltige Verbesserung?'},
    {id:'iso9004',order:9,group:'ISO-Normen',title:'ISO 9004 · Nachhaltiger Erfolg',short:'Qualität der Organisation, Identität, Reifegrad und Lernen',icon:'09',keywords:['iso 9004','nachhaltiger erfolg','reifegrad','selbstbewertung'],iso:'Primärquelle: DIN EN ISO 9004:2018',m1:'Vertiefung: Prozessleistung und Verbesserung',m2:'Vertiefung: EFQM und Benchmarking',goal:'Du ordnest nachhaltigen Erfolg und Reifegrad über ISO 9001 hinaus ein.',impulse:'Was unterscheidet Normkonformität von langfristigem Organisationserfolg?'},
    {id:'audit',order:10,group:'ISO-Normen',title:'ISO 19011 · Auditieren',short:'Auditprinzipien, Auditprogramm, Durchführung und Kompetenz',icon:'10',keywords:['audit','auditor','auditprogramm','auditfeststellung'],iso:'Primärquelle: DIN EN ISO 19011:2018',m1:'Vertiefung: Prozessanalyse und Nachweise',m2:'Transfer: Führung, Bewertung und Maßnahmen',goal:'Du wendest Auditprinzipien, Auditprogramm, Durchführung und Auditorenkompetenz an.',impulse:'Wie wird aus einer Beobachtung eine belastbare Auditfeststellung?'},
    {id:'prozess',order:11,group:'QM Modul 1',title:'Modul 1 · Grundlagen des Prozessmanagements',short:'Prozesse erkennen, visualisieren, beherrschen und verbessern',icon:'11',keywords:['prozess','prozesseigner','prozesslandkarte','pdca','prozesskennzahl'],iso:'Normbezug: ISO 9001, Kapitel 4.4',m1:'Primärquelle: QM Modul 1, Kapitel 1, Skriptseiten 7–67',m2:'Transfer: Führung und KVP',goal:'Du erkennst, visualisierst und beherrschst Prozesse und ihre Wechselwirkungen.',impulse:'Wo endet ein Prozess wirklich – aus Sicht des Empfängers?'},
    {id:'prozesswerkzeuge',order:12,group:'QM Modul 1',title:'Modul 1 · Werkzeuge zum Prozessmanagement',short:'Standardwerkzeuge und sieben Managementwerkzeuge',icon:'12',keywords:['pareto','ishikawa','baumdiagramm','matrixdiagramm','netzplan'],iso:'Normbezug: faktengestützte Entscheidungen',m1:'Primärquelle: QM Modul 1, Kapitel 2, Skriptseiten 68–140',m2:'Transfer: KVP und Problemlösung',goal:'Du wählst Standardwerkzeuge und M7 passend zum Problem und zur Prozessphase aus.',impulse:'Welches Werkzeug macht die wichtigste Ursache sichtbar, ohne schon eine Lösung vorzugeben?'},
    {id:'planungsmethoden',order:13,group:'QM Modul 1',title:'Modul 1 · FMEA, QFD & Design Thinking',short:'Risikovorsorge, Kundenanforderungen und nutzerzentrierte Entwicklung',icon:'13',keywords:['fmea','qfd','quality function deployment','design thinking'],iso:'Normbezug: risikobasiertes Denken und Entwicklung',m1:'Primärquelle: QM Modul 1, Kapitel 3, Skriptseiten 141–186',m2:'Transfer: Strategie und Schadensvermeidung',goal:'Du unterscheidest FMEA, QFD und Design Thinking nach Zweck, Ablauf und Einsatzgebiet.',impulse:'Welche Methode beginnt beim Risiko, welche bei der Kundenstimme und welche beim Nutzerproblem?'},
    {id:'statistik',order:14,group:'QM Modul 1',title:'Modul 1 · Statistik & Auswerteverfahren',short:'Deskriptive und induktive Statistik, AQL und SPC',icon:'14',keywords:['statistik','aql','spc','normalverteilung','stichprobe'],iso:'Normbezug: Überwachung, Messung, Analyse und Bewertung',m1:'Primärquelle: QM Modul 1, Kapitel 4, Skriptseiten 187–268',m2:'Transfer: Qualitätskosten und Kennzahlen',goal:'Du beschreibst Daten, beurteilst Stichproben und verstehst statistische Prozessregelung.',impulse:'Wann zeigt eine Kennzahl echte Prozessänderung und wann nur Zufallsstreuung?'},
    {id:'sixsigma',order:15,group:'QM Modul 1',title:'Modul 1 · Six Sigma & DMAIC',short:'Streuung verstehen und Verbesserungsprojekte steuern',icon:'15',keywords:['six sigma','six-sigma','dmaic'],iso:'Normbezug: fortlaufende Verbesserung',m1:'Primärquelle: QM Modul 1, Kapitel 5, Skriptseiten 269–305',m2:'Transfer: KVP und Mitarbeiterbeteiligung',goal:'Du ordnest Six Sigma und die fünf DMAIC-Phasen einem Verbesserungsprojekt zu.',impulse:'Welche DMAIC-Phase verhindert, dass eine Verbesserung wieder verloren geht?'},
    {id:'efqm',order:16,group:'QM Modul 2',title:'Modul 2 · Führung, Qualitätspreise & EFQM',short:'Führungsmodelle, Qualitätspreise, EFQM 2025 und RADAR',icon:'16',keywords:['efqm','radar','qualitätspreis','tqm'],iso:'Normbezug: ISO 9004 und nachhaltiger Erfolg',m1:'Transfer: Prozessleistung und Kennzahlen',m2:'Primärquelle: QM Modul 2, Kapitel 1–3, Skriptseiten 8–33',goal:'Du ordnest Führungsmodelle, Qualitätspreise, EFQM und RADAR ein.',impulse:'Was bewertet EFQM zusätzlich zu einem normkonformen Managementsystem?'},
    {id:'bsc',order:17,group:'QM Modul 2',title:'Modul 2 · Balanced Scorecard',short:'Strategie über vier Perspektiven in Ziele und Kennzahlen übersetzen',icon:'17',keywords:['balanced scorecard','bsc','perspektive'],iso:'Normbezug: Qualitätsziele und Leistungsbewertung',m1:'Transfer: Prozesskennzahlen',m2:'Primärquelle: QM Modul 2, Kapitel 4, Skriptseiten 34–42',goal:'Du verstehst Perspektiven, Ursache-Wirkungs-Logik und Einführung einer Balanced Scorecard.',impulse:'Welche Kennzahl zeigt früh, ob ein späteres Finanzergebnis erreichbar ist?'},
    {id:'benchmarking',order:18,group:'QM Modul 2',title:'Modul 2 · Benchmarking',short:'Von den Besten lernen und Vergleichsprozesse gestalten',icon:'18',keywords:['benchmark','best practice'],iso:'Normbezug: Bewertung und Verbesserung',m1:'Transfer: Prozessvergleich und Kennzahlen',m2:'Primärquelle: QM Modul 2, Kapitel 5, Skriptseiten 43–48',goal:'Du unterscheidest Benchmarking-Arten, Partnerwahl und Ablauf.',impulse:'Wann führt ein Vergleich zu Lernen – und wann nur zu blindem Kopieren?'},
    {id:'kvp',order:19,group:'QM Modul 2',title:'Modul 2 · KVP & Nichtkonformität',short:'Kaizen, Fehlerumgang, 8D, Qualitätskosten und Qualitätszirkel',icon:'19',keywords:['kaizen','kvp','8d','qualitätszirkel','qualitätskosten'],iso:'Normbezug: ISO 9001, Kapitel 10',m1:'Transfer: Prozesswerkzeuge und Six Sigma',m2:'Primärquelle: QM Modul 2, Kapitel 6, Skriptseiten 49–81',goal:'Du wendest Kaizen, KVP, 8D, Qualitätskosten und Qualitätszirkel praxisnah an.',impulse:'Welche Maßnahme löst nur den aktuellen Fehler und welche verändert das System?'},
    {id:'mitarbeiter',order:20,group:'QM Modul 2',title:'Modul 2 · Mitarbeiterorientierung',short:'Qualifizierung, Gespräche, Befragungen und Motivation',icon:'20',keywords:['mitarbeiterorientierung','mitarbeitergespräch','mitarbeiterbefragung','motivation'],iso:'Normbezug: Führung, Kompetenz und Bewusstsein',m1:'Transfer: Mitarbeiterbeteiligung in Six Sigma',m2:'Primärquelle: QM Modul 2, Kapitel 7, Skriptseiten 82–88',goal:'Du verstehst Mitarbeiterorientierung, Qualifizierung, Gespräche und Befragungen als Führungsaufgabe.',impulse:'Woran erkennst du, ob Beteiligung ernst gemeint oder nur formal organisiert ist?'},
    {id:'wissensmanagement',order:21,group:'QM Modul 2',title:'Modul 2 · Wissensmanagement',short:'Wissen erkennen, sichern, teilen und weiterentwickeln',icon:'21',keywords:['wissensmanagement','wissenstransfer','wissen der organisation'],iso:'Normbezug: ISO 9001, Abschnitt 7.1.6',m1:'Transfer: Prozesswissen und Kennzahlen',m2:'Primärquelle: QM Modul 2, Kapitel 8, Skriptseiten 89–91',goal:'Du erkennst, sicherst, teilst und entwickelst Organisationswissen.',impulse:'Welches kritische Wissen verlässt die Organisation, wenn eine erfahrene Person geht?'},
    {id:'recht',order:22,group:'QM Modul 2',title:'Modul 2 · Recht, Haftung & Schadensvermeidung',short:'Rechtsgrundlagen, Produktverantwortung, Verträge und Prävention',icon:'22',keywords:['recht','produkthaft','produzentenhaft','gewährleistung','ce-kennzeichnung'],iso:'Normbezug: betriebliche Steuerung und Risikobehandlung',m1:'Transfer: FMEA und Prozessbeherrschung',m2:'Primärquelle: QM Modul 2, Kapitel 9–12, Skriptseiten 92–164',goal:'Du unterscheidest Rechtsgrundlagen, Haftung und Schadensvermeidungsstrategien.',impulse:'Welche organisatorische Maßnahme kann einen Haftungsfall verhindern, bevor ein Produkt ausgeliefert wird?'}
  ];

  function questionsForLearningModule(module) {
    const keys = module.keywords.map(k => k.toLowerCase());
    // Der Lernpfad verwendet ausschließlich Fragen mit einem nachvollziehbaren Beleg aus
    // ISO, TÜV Modul 1 oder TÜV Modul 2. Fragen mit begrenzter Quellenlage bleiben im
    // Originaltrainer erhalten, werden hier aber nicht als sichere Selbstlernfrage eingesetzt.
    const verified = getAllQuestions().filter(q => q.sourceRef && !['limited', 'open'].includes(q.sourceStatus));
    const eligible = verified.filter(q => !q.learningChapterId || q.learningChapterId === module.id);
    const explicitlyAssigned = eligible.filter(q => q.learningChapterId === module.id);
    const hits = eligible.filter(q => {
      const text = `${q.question} ${(q.answers||[]).map(a=>a.text).join(' ')} ${q.questionComment||''}`.toLowerCase();
      return keys.some(k => text.includes(k));
    });
    return explicitlyAssigned.length ? explicitlyAssigned : hits;
  }

  function moduleStats(module) {
    const ids = new Set(questionsForLearningModule(module).map(q=>q.uid));
    const logs = (store.attemptLog||[]).filter(a=>ids.has(a.uid));
    const correct = logs.filter(a=>a.correct).length;
    const accuracy = logs.length ? Math.round(correct/logs.length*100) : 0;
    const progress = store.learningPathProgress?.[module.id] || {};
    let stage = 'Noch nicht begonnen';
    if (logs.length >= 50 && accuracy >= 85) stage = 'Sehr sicher geübt';
    else if (logs.length >= 30 && accuracy >= 75) stage = 'Stabil im Aufbau';
    else if (logs.length >= 10) stage = 'Im Aufbau';
    else if (logs.length || progress.startedAt) stage = 'Begonnen';
    return {attempts:logs.length, correct, accuracy, stage, started:!!progress.startedAt || logs.length > 0};
  }

  function learningCoachMessage(session) {
    if (!session || session.mode !== 'path') return '';
    const answered = Number(session.pathAnsweredTotal || 0);
    const wrong = Number(session.wrongInSession || 0);
    const breakEvery = [20,50].includes(Number(session.breakEveryQuestions)) ? Number(session.breakEveryQuestions) : 20;
    const untilBreak = Math.max(0, Number(session.breakNextAtInSession || breakEvery) - Number(session.breakAnsweredInSession || 0));
    if (session.breakGameEnabled && untilBreak > 0 && untilBreak <= 3) return `Noch ${untilBreak} ${untilBreak === 1 ? 'Frage' : 'Fragen'} bis zur Erholungspause. Danach läuft der Lernpfad an derselben Stelle weiter.`;
    if (answered >= 4 && wrong >= Math.ceil(answered * .5)) return 'Dieser Abschnitt fordert dich gerade. Das ist kein Rückschritt: Schau auf den Zusammenhang und die Begründung, nicht auf die Antwortposition.';
    if (answered >= 5 && Number(session.correctInSession || 0) / answered >= .8) return 'Du erkennst die Zusammenhänge inzwischen sicher. Bleib aufmerksam und begründe die Lösung weiterhin für dich selbst.';
    return 'Der Lernpfad endet nicht nach einer festen Zahl. Du lernst im eigenen Rhythmus weiter und kannst den Durchgang jederzeit pausieren.';
  }

  const CARAT_AUDIT_CHAPTERS = [{"number": 1, "id": "auftrag", "title": "Auditauftrag, Grundlagen und Kontext", "short": "CARAT verstehen: Auftrag, Normen, Grundbegriffe, Kontext, interessierte Parteien und Prozesslandschaft.", "station": "Besprechungsraum und Unternehmensübersicht", "people": "Geschäftsführer Jonas Hartmann und QMB Lea Berger", "arc": "Der Auditor klärt, was CARAT tut, welche Anforderungen gelten und wie das Qualitätsmanagementsystem abgegrenzt ist.", "source": "ISO 9000/9001; TÜV Modul 1 – Grundlagen und Unternehmensumfeld"}, {"number": 2, "id": "fuehrung", "title": "Führung, Politik und Kundenorientierung", "short": "Verantwortung der obersten Leitung, Qualitätspolitik, Rollen und Kundenorientierung.", "station": "Eröffnungsgespräch mit der Geschäftsführung", "people": "Jonas Hartmann, Lea Berger und Vertriebsleiterin Miriam Vogt", "arc": "Aussagen der Leitung werden als Auditspuren festgehalten und später im Betrieb überprüft.", "source": "ISO 9001 Kapitel 5; TÜV Modul 1 – Führung"}, {"number": 3, "id": "planung", "title": "Planung, Risiken, Chancen und Ziele", "short": "Risikobasiertes Denken, Qualitätsziele und geplante Änderungen.", "station": "Planungsrunde für den neuen TK-Mango-Beeren-Mix", "people": "Lea Berger, Produktionsleiterin Nora Seidel und Controlling", "arc": "CARAT plant eine neue Produktlinie und muss Risiken, Chancen, Ziele, Ressourcen und Änderungen zusammenführen.", "source": "ISO 9001 Kapitel 6; TÜV Modul 1 – Planung"}, {"number": 4, "id": "unterstuetzung", "title": "Unterstützung: Menschen, Anlagen und Informationen", "short": "Ressourcen, Infrastruktur, Kompetenz, Wissen, Kommunikation und Dokumentenlenkung.", "station": "Technikraum, Personalbereich und Dokumentenprüfung", "people": "Techniker Daniel Kern, Personalreferentin Alina Koch und QMB Lea Berger", "arc": "Der Auditor prüft, ob Menschen, Technik und Informationen den geplanten Ablauf tatsächlich tragen.", "source": "ISO 9001 Kapitel 7; TÜV Modul 1 – Unterstützung"}, {"number": 5, "id": "kunde_entwicklung", "title": "Kundenanforderungen und Entwicklung", "short": "Vom Kundenwunsch zur geplanten und freigegebenen Produktlösung.", "station": "Vertrieb und Produktentwicklung", "people": "Miriam Vogt, Nora Seidel und ein Team aus Qualität und Produktion", "arc": "Nordmarkt ändert Anforderungen am neuen Produkt. Der Auditor verfolgt, wie CARAT sie prüft, entwickelt und weitergibt.", "source": "ISO 9001 Kapitel 8.1–8.3; TÜV Modul 1 – Betrieb"}, {"number": 6, "id": "lieferanten", "title": "Externe Anbieter und Lieferantenaudit", "short": "Auswahl, Bewertung, Steuerung und Kommunikation mit Mango Life.", "station": "Einkauf und Lieferantenakte Mango Life", "people": "Einkaufsleiter Tim Weber und Lieferantenvertreter von Mango Life", "arc": "Die Charge ML-2607-18 wird bestellt. Der Auditor verfolgt, ob Anforderungen und Steuerung des Lieferanten nachvollziehbar sind.", "source": "ISO 9001 Kapitel 8.4; TÜV Modul 2 – externe Bereitstellung und Lieferantenaudit"}, {"number": 7, "id": "betrieb", "title": "Wareneingang, Produktion und Freigabe", "short": "Die Mangocharge durch Prüfung, Verarbeitung, Kennzeichnung und Freigabe begleiten.", "station": "Wareneingang, Produktion und Tiefkühlbereich", "people": "Wareneingangsprüferin Sarah König und Produktionsleiterin Nora Seidel", "arc": "Die konkrete Mangocharge trifft ein und wird als Stichprobe durch den gesamten betrieblichen Ablauf verfolgt.", "source": "ISO 9001 Kapitel 8.5–8.7; TÜV Modul 2 – Betrieb"}, {"number": 8, "id": "lager_kunde", "title": "Lager, Versand, Kunde und Kommunikation", "short": "Erhaltung, Rückverfolgbarkeit, Versand, Kundenkommunikation und Reklamation.", "station": "Tiefkühllager, Verpackung, Versand und Vertrieb", "people": "Lagerleiter Paul Richter und Vertriebsleiterin Miriam Vogt", "arc": "Die Fertigcharge wird ausgeliefert. Eine Kundenrückmeldung zwingt den Auditor, frühere Spuren erneut zu verbinden.", "source": "ISO 9001 Kapitel 8 und 9.1.2; TÜV Modul 2 – Betrieb und Kommunikation"}, {"number": 9, "id": "bewertung", "title": "Leistungsbewertung, Audit und Managementbewertung", "short": "Daten, interne Audits, Auditfeststellungen und Managementbewertung.", "station": "QM-Büro, internes Audit und Managementsitzung", "people": "Interne Auditorin Eva Brandt, QMB Lea Berger und Geschäftsführung", "arc": "CARAT muss zeigen, ob es seine Leistung selbst erkennt, bewertet und auf Leitungsebene wirksam behandelt.", "source": "ISO 9001 Kapitel 9; TÜV Modul 2 – Bewertung, Auditierung und Zertifizierung"}, {"number": 10, "id": "verbesserung", "title": "Verbesserung und Abschluss als Auditor", "short": "Nichtkonformität, Ursachen, Maßnahmen, Wirksamkeit, TQM und Prüfungstransfer.", "station": "Abschlussbesprechung und Maßnahmenverfolgung", "people": "Auditteam und verantwortliche CARAT-Führungskräfte", "arc": "Der Lernende bündelt Beobachtungen, formuliert Feststellungen und prüft die Wirksamkeit der Reaktionen.", "source": "ISO 9001 Kapitel 10; TÜV Modul 2 – Verbesserung, Projektmanagement und TQM"}];

  function questionsForAuditChapter(chapter) {
    return getAllQuestions().filter(q => Number(q.caratChapter) === Number(chapter.number));
  }

  function auditChapterStats(chapter) {
    const ids = new Set(questionsForAuditChapter(chapter).map(q => q.uid));
    const logs = (store.attemptLog || []).filter(a => ids.has(a.uid));
    const correct = logs.filter(a => a.correct).length;
    const accuracy = logs.length ? Math.round(correct / logs.length * 100) : 0;
    const progress = store.auditJourneyProgress?.[chapter.id] || {};
    return {attempts: logs.length, correct, accuracy, started: Boolean(progress.startedAt || logs.length), completed: Boolean(progress.completed)};
  }

  function auditCoachMessage(session) {
    const answered = Number(session.auditAnsweredTotal || 0);
    const breakEvery = [20,50].includes(Number(session.breakEveryQuestions)) ? Number(session.breakEveryQuestions) : 20;
    const untilBreak = Math.max(0, Number(session.breakNextAtInSession || breakEvery) - Number(session.breakAnsweredInSession || 0));
    if (session.breakGameEnabled && untilBreak > 0 && untilBreak <= 3) return `Noch ${untilBreak} ${untilBreak === 1 ? 'Frage' : 'Fragen'} bis zur Erholungspause. Die interaktive Betriebsbegehung wird danach genau hier fortgesetzt.`;
    if (!answered) return 'Versuche zuerst die neutrale Originalfrage. Die CARAT-Hilfe übersetzt sie bei Bedarf in eine beobachtbare Auditsituation, ohne die Lösung zu nennen.';
    return 'Nach jeder Antwort wird die zusammenhängende CARAT-Geschichte fortgesetzt. Beobachtung, Bewertung und fachliche Quelle bleiben getrennt.';
  }

  function renderAuditJourney() {
    const cards = CARAT_AUDIT_CHAPTERS.map(ch => {
      const st = auditChapterStats(ch);
      const active = store.activeSession?.mode === 'audit' && store.activeSession?.auditChapterId === ch.id;
      return `<article class="audit-chapter-card ${st.started || active ? 'active' : ''}">
        <div class="audit-day">Tag ${ch.number}</div>
        <div class="audit-chapter-copy"><span class="path-status">${active ? 'Begehung pausiert' : st.completed ? 'Abschnitt bearbeitet' : st.started ? 'Begonnen' : 'Noch nicht begonnen'}</span><h2>${esc(ch.title)}</h2><p>${esc(ch.short)}</p>
        <div class="audit-location"><strong>Station:</strong> ${esc(ch.station)}<br><strong>Beteiligte:</strong> ${esc(ch.people)}</div>
        <div class="path-meta"><span>Auditfragen</span><span>${st.attempts} Versuche</span><span>${st.attempts ? st.accuracy + '%' : '–'} richtig</span></div>
        <details class="path-details"><summary>Handlungsbogen und Quellenrichtung</summary><div><p>${esc(ch.arc)}</p><p><strong>Quellenrichtung:</strong> ${esc(ch.source)}</p></div></details>
        <div class="actions"><button class="primary-btn" data-action="${active ? 'resume-session' : 'start-audit-chapter'}" data-chapter="${ch.number}">${active ? 'Genau hier fortsetzen' : st.started ? 'Abschnitt erneut prüfen' : 'Begehungsabschnitt beginnen'}</button><button class="ghost-btn" data-action="open-audit-docs">Prüfmittel öffnen</button></div></div>
      </article>`;
    }).join('');
    app.innerHTML = layout(`<div class="audit-journey-page">
      <section class="audit-hero"><div><div class="eyebrow">Auditpraxis im CARAT-Betrieb</div><h1>Interaktive Betriebsbegehung</h1><p class="lead">Zehn zusammenhängende Begehungsabschnitte verbinden den Fragenbestand mit Orten, Personen, Handlungen und Folgen im fiktiven CARAT-Betrieb. Die neutrale Frage bleibt erhalten; die optionale Auditszene hilft beim Verstehen, ohne die Lösung vorwegzunehmen.</p>
      <div class="inspiration-note"><strong>So funktioniert es</strong><p>Die interaktive Betriebsbegehung nutzt Geschichten, Bilder, Zusammenhänge und eigenes Entdecken, damit abstrakte Inhalte leichter verständlich werden.</p></div></div>
      <div class="audit-overview"><strong>10</strong><span>zusammenhängende Begehungsabschnitte</span><small>Fragen, Praxisszenen und Quellenhinweise in einer gemeinsamen Handlung</small></div></section>
      <section class="audit-method"><div><div class="eyebrow">Fester Ablauf</div><h2>Frage → CARAT-Hilfe → Antwort → Geschichte → Quelle</h2><p>Die Geschichte erscheint nach jeder Antwort. Bei einer falschen Antwort bleibt die Korrektur ausführlicher; bei noch nicht individuell geprüfter Quellenlage wird das offen angezeigt.</p></div><button class="secondary-btn" data-action="learning-path">Zum klassischen Lernpfad</button></section>
      <section class="path-documents audit-documents"><div><div class="eyebrow">Eigene Prüfmittel</div><h2>ISO, TÜV Modul 1 und TÜV Modul 2</h2><p>Wähle deine rechtmäßig vorhandenen PDFs einmal lokal auf diesem Gerät aus.</p></div><div class="actions"><button class="secondary-btn" data-action="document-search" data-source="iso">PDFs einrichten &amp; suchen</button></div></section>
      <section class="audit-chapter-list">${cards}</section>
    </div>`);
  }

  function activeSessionPositionText(session) {
    if (!session) return '';
    if (session.mode === 'path') {
      return `Fortlaufender Lernpfad · <strong>${Number(session.pathAnsweredTotal || 0)}</strong> beantwortet · der genaue Stand ist gespeichert.`;
    }
    if (session.mode === 'audit') {
      return `Interaktive Betriebsbegehung · Abschnitt <strong>${session.auditChapterNumber || session.questions?.[0]?.caratChapter || '–'}</strong> · Frage <strong>${Math.min((session.index || 0) + 1, session.questions?.length || 0)}</strong> von <strong>${session.questions?.length || 0}</strong>. Geschichte, Hilfe und Antwortreihenfolge sind gespeichert.`;
    }
    return `Du warst bei Frage <strong>${Math.min((session.index || 0) + 1, session.questions?.length || 0)}</strong> von <strong>${session.questions?.length || 0}</strong>. Antworten, Reihenfolge und Zeitstand sind gespeichert.`;
  }

  function saveActiveSession() {
    if (!state.session || state.session.endedAt) {
      store.activeSession = null;
    } else {
      store.activeSession = JSON.parse(JSON.stringify(state.session));
    }
    saveStore();
  }

  function ensureSessionActivity(session = state.session) {
    if (!session) return null;
    session.activeMilliseconds = Math.max(0, Number(session.activeMilliseconds || 0));
    session.questionActiveMilliseconds = session.questionActiveMilliseconds && typeof session.questionActiveMilliseconds === 'object' ? session.questionActiveMilliseconds : {};
    session.lastActivityAt = Number.isFinite(Number(session.lastActivityAt)) ? Number(session.lastActivityAt) : Date.now();
    return session;
  }

  function registerSessionActivity(now = Date.now(), allowHidden = false) {
    const session = ensureSessionActivity();
    if (!session || session.endedAt || state.view !== 'session') return 0;
    if (document.hidden && !allowHidden) return 0;
    const previous = Math.min(Number(session.lastActivityAt || now), now);
    const counted = Math.max(0, Math.min(now - previous, ACTIVE_IDLE_LIMIT_MS));
    session.activeMilliseconds += counted;
    const question = session.questions?.[session.index];
    if (question) {
      const key = sessionQuestionKey(question);
      session.questionActiveMilliseconds[key] = Math.max(0, Number(session.questionActiveMilliseconds[key] || 0)) + counted;
    }
    session.lastActivityAt = now;
    return counted;
  }

  function resetSessionActivityClock(session = state.session) {
    if (!session) return;
    ensureSessionActivity(session);
    session.lastActivityAt = Date.now();
  }

  function activeSessionSeconds(session = state.session) {
    if (!session) return 0;
    return Math.max(0, Math.round(Number(session.activeMilliseconds || 0) / 1000));
  }

  function restoreActiveSession() {
    const saved = store.activeSession;
    if (!saved || !Array.isArray(saved.questions) || !saved.questions.length) return false;
    const restored = JSON.parse(JSON.stringify(saved));
    restored.index = Math.max(0, Math.min(Number(restored.index || 0), restored.questions.length - 1));
    restored.selections = restored.selections && typeof restored.selections === 'object' ? restored.selections : {};
    restored.checked = restored.checked && typeof restored.checked === 'object' ? restored.checked : {};
    restored.hints = restored.hints && typeof restored.hints === 'object' ? restored.hints : {};
    restored.flagged = restored.flagged && typeof restored.flagged === 'object' ? restored.flagged : {};
    restored.caratHelpShown = restored.caratHelpShown && typeof restored.caratHelpShown === 'object' ? restored.caratHelpShown : {};
    restored.completedUids = Array.isArray(restored.completedUids) ? restored.completedUids : [];
    restored.currentQuestionStartedAt = Date.now();
    ensureSessionActivity(restored);
    restored.lastActivityAt = Date.now();
    if (!Number.isFinite(Number(restored.breakAnsweredInSession))) restored.breakAnsweredInSession = restored.completedUids.length;
    const breakEvery = [20,50].includes(Number(restored.breakEveryQuestions)) ? Number(restored.breakEveryQuestions) : Number(store.breakEveryQuestions || 20);
    restored.breakEveryQuestions = breakEvery;
    if (!Number.isFinite(Number(restored.breakNextAtInSession)) || Number(restored.breakNextAtInSession) < breakEvery) {
      restored.breakNextAtInSession = (Math.floor(Number(restored.breakAnsweredInSession || 0) / breakEvery) + 1) * breakEvery;
    }
    if (restored.mode === 'path') {
      restored.pathAnsweredTotal = Number(restored.pathAnsweredTotal || Object.keys(restored.checked).length || 0);
      restored.pathCycle = Number(restored.pathCycle || 1);
    }
    if (restored.mode === 'audit') {
      restored.auditAnsweredTotal = Number(restored.auditAnsweredTotal || Object.keys(restored.checked).length || 0);
      restored.auditChapterId = restored.auditChapterId || restored.questions?.[0]?.caratChapterId || null;
    }
    state.session = restored;
    state.breakPrompt = null;
    state.game = null;
    state.pendingSession = null;
    state.view = 'session';
    saveActiveSession();
    return true;
  }

  function clearActiveSession() {
    store.activeSession = null;
    saveStore();
  }

  function discardActiveSession() {
    clearInterval(timerHandle);
    if (globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
    state.session = null;
    state.breakPrompt = null;
    state.game = null;
    state.pendingSession = null;
    store.activeSession = null;
    saveStore();
    state.view = 'home';
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        ...defaultStore,
        ...parsed,
        theme: parsed.theme || localStorage.getItem('iso9001_theme') || 'light',
        backgroundColor: normalizeBackgroundColor(parsed.backgroundColor),
        readableFont: typeof parsed.readableFont === 'boolean' ? parsed.readableFont : localStorage.getItem('iso9001_dys') === '1',
        highContrast: typeof parsed.highContrast === 'boolean' ? parsed.highContrast : localStorage.getItem('iso9001_hc') === '1',
        nightLevel: Number.isFinite(Number(parsed.nightLevel)) ? Math.max(0, Math.min(3, Number(parsed.nightLevel))) : Math.max(0, Math.min(3, Number(localStorage.getItem('iso9001_night') || 0))),
        customQuestions: Array.isArray(parsed.customQuestions) ? parsed.customQuestions : [],
        overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
        archivedIds: Array.isArray(parsed.archivedIds) ? parsed.archivedIds : [],
        customCategories: Array.isArray(parsed.customCategories) ? parsed.customCategories : [],
        breakGameEnabled: parsed.breakGameEnabled !== false,
        breakAnsweredTotal: Number.isFinite(Number(parsed.breakAnsweredTotal)) ? Number(parsed.breakAnsweredTotal) : 0,
        breakEveryQuestions: [20,50].includes(Number(parsed.breakEveryQuestions)) ? Number(parsed.breakEveryQuestions) : 20,
        breakNextAt: Number.isFinite(Number(parsed.breakNextAt)) && Number(parsed.breakNextAt) >= 20 ? Number(parsed.breakNextAt) : 20,
        breakRotationIndex: Number.isFinite(Number(parsed.breakRotationIndex)) ? Number(parsed.breakRotationIndex) : 0,
        breakDurationMinutes: [2,3,4,5].includes(Number(parsed.breakDurationMinutes)) ? Number(parsed.breakDurationMinutes) : 3,
        activeSession: parsed.dataRevision === DATA_REVISION && parsed.activeSession && typeof parsed.activeSession === 'object' ? parsed.activeSession : null,
        dataRevision: DATA_REVISION,
        attemptLog: Array.isArray(parsed.attemptLog) ? parsed.attemptLog : [],
        sessionHistory: Array.isArray(parsed.sessionHistory) ? parsed.sessionHistory : [],
        learningPathProgress: parsed.learningPathProgress && typeof parsed.learningPathProgress === 'object' ? parsed.learningPathProgress : {},
        learningPathLastModule: parsed.learningPathLastModule || null,
        openBookProgress: parsed.openBookProgress && typeof parsed.openBookProgress === 'object' ? parsed.openBookProgress : {},
        openBookHistory: Array.isArray(parsed.openBookHistory) ? parsed.openBookHistory : [],
        pathHelpUsage: parsed.pathHelpUsage && typeof parsed.pathHelpUsage === 'object' ? parsed.pathHelpUsage : {},
        auditJourneyProgress: parsed.auditJourneyProgress && typeof parsed.auditJourneyProgress === 'object' ? parsed.auditJourneyProgress : {},
        auditJourneyLastChapter: parsed.auditJourneyLastChapter || null,
        auditHelpUsage: parsed.auditHelpUsage && typeof parsed.auditHelpUsage === 'object' ? parsed.auditHelpUsage : {},
        videoGuideProgress: parsed.videoGuideProgress && typeof parsed.videoGuideProgress === 'object' ? parsed.videoGuideProgress : {},
        examDate: parsed.examDate || loadWorkshopStats().examDate || '',
        dailyQuestionGoal: [5,10,20,30,50].includes(Number(parsed.dailyQuestionGoal)) ? Number(parsed.dailyQuestionGoal) : 20,
        fiveDayReviewStartedAt: typeof parsed.fiveDayReviewStartedAt === 'string' ? parsed.fiveDayReviewStartedAt : '',
        fiveDayReviewLastShownAt: typeof parsed.fiveDayReviewLastShownAt === 'string' ? parsed.fiveDayReviewLastShownAt : '',
        tutorialCompletedVersion: Number.isFinite(Number(parsed.tutorialCompletedVersion)) ? Math.max(0, Number(parsed.tutorialCompletedVersion)) : 0,
        tutorialCompletedAt: typeof parsed.tutorialCompletedAt === 'string' ? parsed.tutorialCompletedAt : ''
      };
    } catch {
      return {...defaultStore};
    }
  }

  function saveStore() {
    store.databaseVersion = APP_SCHEMA_VERSION;
    store.dataRevision = DATA_REVISION;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) {
      toast('Speicher ist voll. Bitte zuerst eine Sicherung exportieren.');
      console.error(error);
    }
  }

  function loadWorkshopStats() {
    try {
      const legacy = JSON.parse(localStorage.getItem('iso9001trainer_v1') || '{}');
      return legacy && typeof legacy === 'object' ? legacy : {};
    } catch {
      return {};
    }
  }

  function saveWorkshopStats(value) {
    try {
      localStorage.setItem('iso9001trainer_v1', JSON.stringify(value || {}));
    } catch (error) {
      console.error(error);
    }
  }

  function touchDatabase() {
    store.databaseUpdatedAt = new Date().toISOString();
    saveStore();
  }

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function randomIndex(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    if (globalThis.crypto?.getRandomValues) {
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      const value = new Uint32Array(1);
      do globalThis.crypto.getRandomValues(value); while (value[0] >= limit);
      return value[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function fmtTime(seconds) {
    const sec = Math.max(0, Math.floor(seconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatDate(iso, withTime = false) {
    if (!iso) return 'Noch keine Änderung';
    try {
      return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        ...(withTime ? {timeStyle: 'short'} : {})
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function sameSet(a, b) {
    const x = [...a].sort((m, n) => m - n);
    const y = [...b].sort((m, n) => m - n);
    return x.length === y.length && x.every((value, index) => value === y[index]);
  }

  function correctIndexes(question) {
    return question.answers.map((answer, index) => answer.correct ? index : -1).filter(index => index >= 0);
  }

  function sessionQuestionKey(question) {
    return question?.sessionUid || question?.uid || '';
  }

  function selectedForQuestion(question) {
    return state.session?.selections?.[sessionQuestionKey(question)] || [];
  }

  function slugify(value) {
    const base = String(value || 'kategorie')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'kategorie';
    let id = `custom-${base}`;
    const used = new Set(getCategories().map(category => category.id));
    let number = 2;
    while (used.has(id)) id = `custom-${base}-${number++}`;
    return id;
  }

  function normalizeBaseQuestion(question) {
    const override = store.overrides?.[question.uid] || {};
    const baseCategoryId = question.categoryId || `test-${question.test}`;
    return {
      ...question,
      ...override,
      answers: Array.isArray(override.answers) ? override.answers : question.answers,
      categoryId: override.categoryId || baseCategoryId,
      categoryName: override.categoryName || question.categoryName || question.testName || `Test ${question.test}`,
      testName: override.categoryName || question.categoryName || question.testName || `Test ${question.test}`,
      origin: 'base',
      updatedAt: override.updatedAt || null
    };
  }

  function normalizeCustomQuestion(question) {
    return {
      ...question,
      originalId: question.originalId || question.displayId || '',
      sourceSheet: question.sourceSheet || 'Eigene Fragendatenbank',
      sourceRow: question.sourceRow || null,
      questionComment: question.questionComment || '',
      test: question.test || null,
      testName: question.categoryName || question.testName || 'Eigene Fragen',
      categoryId: question.categoryId || 'custom-eigene-fragen',
      categoryName: question.categoryName || question.testName || 'Eigene Fragen',
      displayId: question.displayId || 'Eigene Frage',
      uid: question.uid,
      question: question.question || '',
      answers: Array.isArray(question.answers) ? question.answers : [],
      origin: 'custom',
      createdAt: question.createdAt || null,
      updatedAt: question.updatedAt || null
    };
  }

  function getAllQuestions() {
    const archived = new Set(store.archivedIds || []);
    const base = BASE_QUESTIONS
      .filter(question => !archived.has(question.uid))
      .map(normalizeBaseQuestion);
    const custom = (store.customQuestions || [])
      .filter(question => question && question.uid && !archived.has(question.uid))
      .map(normalizeCustomQuestion);
    return [...base, ...custom];
  }

  function getQuestionByUid(uid, includeArchived = false) {
    const base = BASE_QUESTIONS.find(question => question.uid === uid);
    if (base) {
      if (!includeArchived && (store.archivedIds || []).includes(uid)) return null;
      return normalizeBaseQuestion(base);
    }
    const custom = (store.customQuestions || []).find(question => question.uid === uid);
    if (!custom) return null;
    if (!includeArchived && (store.archivedIds || []).includes(uid)) return null;
    return normalizeCustomQuestion(custom);
  }

  function getCategories() {
    const map = new Map();
    for (const category of store.customCategories || []) {
      if (category?.id && category?.name) {
        map.set(category.id, {id: category.id, name: category.name, kind: 'custom', order: 1000});
      }
    }
    for (const question of getAllQuestions()) {
      if (!map.has(question.categoryId)) {
        map.set(question.categoryId, {
          id: question.categoryId,
          name: question.categoryName || 'Eigene Fragen',
          kind: question.origin === 'base' ? 'base' : 'custom',
          order: Number(question.categoryOrder || (question.categoryId.startsWith('test-') ? question.categoryId.replace('test-', '') : 1000))
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'base' ? -1 : 1;
      return (a.order - b.order) || a.name.localeCompare(b.name, 'de');
    });
  }

  function categoryOptions(selected = 'all', includeNew = false) {
    const questions = getAllQuestions();
    let html = `<option value="all" ${selected === 'all' ? 'selected' : ''}>Alle Kategorien (${questions.length} Fragen)</option>`;
    html += getCategories().map(category => {
      const count = questions.filter(question => question.categoryId === category.id).length;
      return `<option value="${esc(category.id)}" ${selected === category.id ? 'selected' : ''}>${esc(category.name)} (${count})</option>`;
    }).join('');
    if (includeNew) html += '<option value="__new__">＋ Neue Kategorie anlegen</option>';
    return html;
  }

  function poolFor(categoryId) {
    const questions = getAllQuestions();
    return categoryId === 'all' ? questions : questions.filter(question => question.categoryId === categoryId);
  }

  function currentWrongQuestions() {
    const wrong = new Set(store.wrongIds || []);
    return getAllQuestions().filter(question => wrong.has(question.uid));
  }

  function setTheme(theme) {
    store.theme = theme;
    try { localStorage.setItem('iso9001_theme', theme); } catch {}
    applyDisplaySettings();
    saveStore();
    render();
  }

  function normalizeBackgroundColor(value) {
    const color = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : defaultStore.backgroundColor;
  }

  function setBackgroundColor(color) {
    store.backgroundColor = normalizeBackgroundColor(color);
    saveDisplaySettings();
    render();
    toast('Hintergrundfarbe wurde gespeichert.');
  }

  function applyDisplaySettings() {
    document.documentElement.dataset.theme = store.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('readable-font', Boolean(store.readableFont));
    document.documentElement.classList.toggle('high-contrast', Boolean(store.highContrast));
    document.documentElement.dataset.night = String(Math.max(0, Math.min(3, Number(store.nightLevel || 0))));
    const backgroundColor = normalizeBackgroundColor(store.backgroundColor);
    document.documentElement.style.setProperty('--user-background', backgroundColor);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', backgroundColor);
  }

  function saveDisplaySettings() {
    try {
      localStorage.setItem('iso9001_theme', store.theme === 'dark' ? 'dark' : 'light');
      localStorage.setItem('iso9001_dys', store.readableFont ? '1' : '0');
      localStorage.setItem('iso9001_hc', store.highContrast ? '1' : '0');
      localStorage.setItem('iso9001_night', String(Math.max(0, Math.min(3, Number(store.nightLevel || 0)))));
    } catch {}
    saveStore();
    applyDisplaySettings();
  }

  function databaseLabel() {
    const own = (store.customQuestions || []).length;
    const edits = Object.keys(store.overrides || {}).length;
    if (!own && !edits) return 'Originaldatenbank';
    return `${own} eigene · ${edits} bearbeitet`;
  }

  let quickMenuOpener = null;

  function openQuickMenu() {
    const menu = document.getElementById('quickMenu');
    if (!menu) return;
    quickMenuOpener = document.activeElement;
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    document.body.classList.add('quick-menu-open');
    requestAnimationFrame(() => menu.querySelector('.quick-menu-item')?.focus());
  }

  function closeQuickMenu() {
    const menu = document.getElementById('quickMenu');
    if (!menu) return;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('quick-menu-open');
    if (quickMenuOpener && document.contains(quickMenuOpener)) quickMenuOpener.focus();
    quickMenuOpener = null;
  }

  const TUTORIAL_STEPS = [
    {
      view: 'home', selector: '.hero-panel', symbol: 'Q', title: 'Willkommen in deiner Qualitätsmanager Lernplattform',
      text: '<p>Diese kurze Tour führt dich durch die wichtigsten Funktionen. Du musst dir den Weg nicht merken: Unter <strong>Einstellungen</strong> kannst du das Tutorial jederzeit erneut starten.</p><p>Die Plattform ist ein privates Lernprojekt. Sie unterstützt deine Prüfungsvorbereitung, ersetzt aber weder Originalunterlagen noch fachliche oder rechtliche Beratung.</p>'
    },
    {
      view: 'home', selector: '.topbar-inner', symbol: '1', title: 'Die feste Navigation', scroll: false,
      text: '<p><strong>Start</strong> bringt dich immer zum persönlichen Überblick. <strong>Statistik</strong> öffnet Auswertung, Fragenkatalog und Datenbank. Unter <strong>Alle Bereiche</strong> findest du sämtliche Lernwege.</p><p>Rechts liegen App-Installation, persönliches Konto, Einstellungen und Nachtmodus.</p>'
    },
    {
      view: 'home', selector: '.stats', symbol: '2', title: 'Dein Lernstand auf einen Blick',
      text: '<p>Hier siehst du den gesamten Fragenbestand, deine wirklich bearbeiteten Fragen, die Trefferquote und den täglichen Durchschnitt.</p><p>Eine Frage zählt erst mit der Antwort. Nach 30 Sekunden ohne Lernaktivität stoppt auch die Zeitmessung automatisch.</p>'
    },
    {
      view: 'home', selector: '.motivation-dashboard', symbol: '3', title: 'Tagesziel und Kompetenzfortschritt',
      text: '<p>Das Tagesziel zerlegt dein Lernen in machbare Schritte. Den Umfang bestimmst du selbst.</p><p>Der Kompetenzfortschritt zeigt, wie viele Fragen des zuletzt bearbeiteten Lernfelds du bereits mindestens einmal richtig gelöst hast.</p>'
    },
    {
      view: 'home', selector: '.exam-date-home', symbol: '4', title: 'Planung bis zur Prüfung',
      text: '<p>Trage deinen Prüfungstermin ein. Die App berechnet daraus eine Orientierung für noch offene oder aktuell falsche Fragen.</p><p>Alle fünf Kalendertage erscheint zusätzlich ein Überblick mit Leistung, aktiver Lernzeit und dem rechnerischen Restpensum.</p>'
    },
    {
      view: 'home', selector: '.quick-priority-list', symbol: '5', title: 'Bereiche 1 bis 4: klassisch üben', quickMenu: true, position: 'bottom',
      text: '<ul><li><strong>Lernpfad:</strong> Fragen mit sofortiger Lösung und Fehlertraining.</li><li><strong>Prüfpfad:</strong> Mini-, Voll- oder eigene Prüfung mit Zeitmessung.</li><li><strong>Lernen nach Kategorien:</strong> Kapitel, Merksätze und Fragen gezielt auswählen.</li><li><strong>Karteikarten:</strong> Wiederholen im Leitner-System und eigene Karten ergänzen.</li></ul>'
    },
    {
      view: 'home', selector: '.quick-priority-list', symbol: '6', title: 'Bereiche 5 bis 10: verstehen und anwenden', quickMenu: true, position: 'bottom',
      text: '<ul><li><strong>Qualitätsmanager Lernpfad:</strong> quellenbezogen verstehen.</li><li><strong>Interaktive Betriebsbegehung:</strong> Auditwissen in einer Praxisgeschichte erleben.</li><li><strong>ISO-/Modulsuche:</strong> in eigenen PDFs nachschlagen.</li><li><strong>Testmodus:</strong> gemischte Fragen mit Auflösung.</li><li><strong>QM-Werkzeuge:</strong> Matrizen und Methoden nutzen.</li><li><strong>Spickzettel:</strong> kompakte Zusammenfassung drucken oder als PDF sichern.</li></ul>'
    },
    {
      view: 'home', selector: '.quick-menu-more', symbol: '7', title: 'Weitere Lern- und Verwaltungsfunktionen', quickMenu: true, position: 'top',
      text: '<p>Hier findest du die Videoanleitungen, Daten und Statistik, Einstellungen sowie die drei dokumentengestützten Lernmodule für ISO, TÜV Modul 1 und TÜV Modul 2.</p><p>Auch Tastenkürzel sind hinterlegt. Die dokumentengestützten Module starten erst, wenn du deine eigene passende PDF auf diesem Gerät ausgewählt hast.</p>'
    },
    {
      view: 'learningPath', selector: '.path-hero', symbol: '8', title: 'Der quellenbezogene Qualitätsmanager Lernpfad',
      text: '<p>Die zehn Kapitel verbinden Fachfragen, Lernziele, Denkimpulse und Quellenrichtungen. Du kannst einen Abschnitt jederzeit pausieren und genau an derselben Stelle fortsetzen.</p><p>Neue eigene Fragen werden hier erst eingesetzt, wenn ihre Quelle von dir als geprüft gekennzeichnet wurde.</p>'
    },
    {
      view: 'auditJourney', selector: '.audit-hero', symbol: '9', title: 'Interaktive Betriebsbegehung',
      text: '<p>Zehn zusammenhängende Stationen übertragen abstrakte Normthemen in einen fiktiven Betrieb. Optional hilft die CARAT-Szene beim Verstehen, ohne die Lösung vorwegzunehmen.</p><p>Nach der Antwort folgen Geschichte und Quellenrichtung – die neutrale Prüfungsfrage bleibt erhalten.</p>'
    },
    {
      view: 'videoGuides', selector: '.video-guide-hero', symbol: '▶', title: 'Visuelle und hörbare Erklärungen',
      text: `<p>${PUBLISHED_VIDEO_GUIDES.length} Kurzvideos ergänzen die Lernpfade. Sie enthalten Szenen, Untertitel und auf Wunsch eine deutsche Gerätestimme.</p><p>Videos sind eine Ergänzung zum Fachtext. Ihr Fortschritt wird gespeichert, damit du später gezielt fortsetzen kannst.</p>`
    },
    {
      view: 'documentSearch', selector: '.local-document-guide', symbol: 'PDF', title: 'Eigene Unterlagen lokal einrichten',
      text: '<p>Die App liefert keine ISO- oder TÜV-Unterlagen mit. Du wählst deine rechtmäßig vorhandenen PDFs selbst aus und öffnest sie über den PDF-Reader deines Geräts.</p><p><strong>Wichtig:</strong> PDFs werden weder hochgeladen noch mit dem Konto synchronisiert. Auf jedem weiteren Gerät müssen sie einmal neu ausgewählt werden.</p>'
    },
    {
      view: 'statistics', selector: '.statistics-metrics', symbol: '%', title: 'Statistik mit echter Lernzeit',
      text: '<p>Antworten, Trefferquote, Lernzeit, Übungstage, Prüfungen und schwierige Lernfelder werden gemeinsam ausgewertet.</p><p>Bloße Anwesenheit zählt nicht: Nach höchstens 30 Sekunden Inaktivität stoppt die Lernzeit, bis du weiterarbeitest.</p>'
    },
    {
      view: 'statistics', selector: '.data-center-switch', symbol: '↔', title: 'Ein Bereich, drei Ansichten',
      text: '<p>Mit diesen drei Schaltern wechselst du zwischen <strong>Statistik</strong>, <strong>Fragenkatalog</strong> und <strong>Datenbank bearbeiten</strong>.</p><p>So bleiben Auswertung, Nachschlagen und Pflege zusammen, ohne Funktionen zu verlieren.</p>'
    },
    {
      view: 'database', selector: '.question-source-editor', symbol: '▦', title: 'Fragen mit Wissensquelle anlegen',
      text: '<p>Beim Erstellen oder Bearbeiten ordnest du jede Frage einem Lernkapitel und einer eigenen Quelle zu. Genaue Fundstelle und Prüfstatus sind Pflicht.</p><p>Nur selbst abgeglichene Fragen werden als <strong>geprüft</strong> markiert und im sicheren Qualitätsmanager Lernpfad verwendet. Offene Fragen bleiben in der Datenbank erhalten, ohne als verlässlich bestätigt zu gelten.</p>'
    },
    {
      view: 'settings', selector: '.account-settings-card', symbol: '@', title: 'Ein Konto auf deinen eigenen Geräten',
      text: '<p>Du meldest dich mit deiner fest zugeteilten E-Mail-Adresse an. Mit demselben Konto kannst du deinen verschlüsselten Lernstand auf deinen eigenen Geräten verwenden.</p><p>Fragen, Statistik und Einstellungen werden abgeglichen. Die privaten PDF-Arbeitskopien bleiben immer ausschließlich auf dem jeweiligen Gerät.</p>'
    },
    {
      view: 'settings', selector: '.settings-grid', symbol: '⚙', title: 'Darstellung, Lernpausen und Sicherung', position: 'top',
      text: '<p>In den Einstellungen wählst du Hintergrund, Tag-/Nachtmodus, Lesbarkeit und Blaulichtfilter. Außerdem legst du Erholungspausen, Karteikartenumfang und Testoptionen fest.</p><p>Über die Gesamtsicherung kannst du Lernstände und eigene Inhalte zusätzlich als JSON-Datei sichern. Lokale PDFs sind bewusst nicht Teil dieser Datei.</p>'
    },
    {
      view: 'info', selector: '.legal-overview-grid', symbol: '§', title: 'Recht, Quellen und Transparenz',
      text: '<p>Hier findest du Impressum, Datenschutz, private Nutzungsbedingungen, Urheberrechts- und Quellenhinweise, den Prüfungstrainer-Hinweis sowie die KI-Transparenz.</p><p>Nutze nur Materialien, zu deren privater Verwendung du berechtigt bist, und prüfe fachlich wichtige Aussagen immer an deinen Originalunterlagen.</p>'
    },
    {
      view: 'home', selector: '.hero-panel', symbol: '✓', title: 'Du bist startklar',
      text: '<p>Beginne über <strong>Alle Bereiche</strong> mit dem Lernweg, der gerade zu dir passt. Startseite, Tagesziel und Statistik helfen dir anschließend, den Überblick zu behalten.</p><p>Das Tutorial kannst du jederzeit unter <strong>Einstellungen → Tutorial & Orientierung</strong> erneut öffnen.</p>', final: true
    }
  ];

  function removeTutorialHighlight() {
    document.querySelectorAll('.tutorial-focus').forEach(element => element.classList.remove('tutorial-focus'));
    document.querySelectorAll('.tutorial-ancestor').forEach(element => element.classList.remove('tutorial-ancestor'));
    document.getElementById('quickMenu')?.classList.remove('tutorial-quick-menu');
  }

  function ensureTutorialLayer() {
    let layer = document.getElementById('appTutorial');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'appTutorial';
    layer.className = 'app-tutorial-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="app-tutorial-backdrop" aria-hidden="true"></div>
      <section class="app-tutorial-card" role="dialog" aria-modal="true" aria-labelledby="appTutorialTitle" aria-describedby="appTutorialText">
        <div class="app-tutorial-progress-head"><span id="appTutorialProgress">Schritt 1</span><button class="app-tutorial-skip" type="button" data-action="tutorial-skip">Tour beenden</button></div>
        <div class="app-tutorial-progress" aria-hidden="true"><span id="appTutorialProgressBar"></span></div>
        <div class="app-tutorial-copy"><span class="app-tutorial-symbol" id="appTutorialSymbol">Q</span><div><h2 id="appTutorialTitle"></h2><div id="appTutorialText"></div></div></div>
        <div class="app-tutorial-actions"><button class="secondary-btn" id="appTutorialBack" type="button" data-action="tutorial-back">Zurück</button><button class="primary-btn" id="appTutorialNext" type="button" data-action="tutorial-next">Weiter</button></div>
      </section>`;
    document.body.appendChild(layer);
    return layer;
  }

  function positionTutorialLayer(layer, target, step) {
    const rect = target?.getBoundingClientRect?.();
    const position = step.position || (rect && rect.top + rect.height / 2 > window.innerHeight * .52 ? 'top' : 'bottom');
    layer.dataset.position = position;
  }

  function showTutorialStep(index = state.tutorialStep) {
    if (!state.tutorialActive) return;
    const boundedIndex = Math.max(0, Math.min(Number(index) || 0, TUTORIAL_STEPS.length - 1));
    state.tutorialStep = boundedIndex;
    const step = TUTORIAL_STEPS[boundedIndex];
    if (state.view !== step.view) {
      state.view = step.view;
      state.editingUid = null;
      render();
      return;
    }
    removeTutorialHighlight();
    if (step.quickMenu) {
      openQuickMenu();
      document.getElementById('quickMenu')?.classList.add('tutorial-quick-menu');
    } else {
      closeQuickMenu();
    }
    const target = document.querySelector(step.selector) || document.querySelector('main') || document.querySelector('.app-shell');
    target?.classList.add('tutorial-focus');
    target?.closest('.topbar, .quick-menu-overlay')?.classList.add('tutorial-ancestor');
    if (step.scroll !== false) target?.scrollIntoView?.({behavior: 'smooth', block: 'center', inline: 'nearest'});

    const layer = ensureTutorialLayer();
    layer.querySelector('#appTutorialProgress').textContent = `Schritt ${boundedIndex + 1} von ${TUTORIAL_STEPS.length}`;
    layer.querySelector('#appTutorialProgressBar').style.width = `${(boundedIndex + 1) / TUTORIAL_STEPS.length * 100}%`;
    layer.querySelector('#appTutorialSymbol').textContent = step.symbol;
    layer.querySelector('#appTutorialTitle').textContent = step.title;
    layer.querySelector('#appTutorialText').innerHTML = step.text;
    const backButton = layer.querySelector('#appTutorialBack');
    const nextButton = layer.querySelector('#appTutorialNext');
    backButton.hidden = boundedIndex === 0;
    nextButton.textContent = step.final ? 'Tutorial abschließen' : 'Weiter';
    positionTutorialLayer(layer, target, step);
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tutorial-open');
    window.setTimeout(() => nextButton.focus(), 80);
  }

  function scheduleTutorialStep(delay = 60) {
    clearTimeout(tutorialTimer);
    if (!state.tutorialActive) return;
    tutorialTimer = window.setTimeout(() => showTutorialStep(state.tutorialStep), delay);
  }

  function tutorialAccountReady() {
    const account = window.QMBAccount?.getSummary?.();
    return !account || ['ready', 'local'].includes(account.tone) || account.label?.startsWith('Offline');
  }

  function scheduleFirstStartTutorial(delay = 550) {
    clearTimeout(tutorialTimer);
    if (state.tutorialActive || state.view !== 'home' || Number(store.tutorialCompletedVersion || 0) >= TUTORIAL_VERSION || !tutorialAccountReady()) return;
    tutorialTimer = window.setTimeout(() => startTutorial(false), delay);
  }

  function startTutorial(manual = true) {
    clearTimeout(tutorialTimer);
    clearTimeout(fiveDayReviewTimer);
    if (state.session && !state.session.endedAt) saveActiveSession();
    if (!state.tutorialActive) tutorialPreviousFocus = document.activeElement;
    if (document.getElementById('appDialog')?.classList.contains('open')) closeAppDialog(false);
    closeInstallHelp();
    closeQuickMenu();
    state.tutorialActive = true;
    state.tutorialStep = 0;
    state.view = 'home';
    state.editingUid = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    render();
    if (manual) toast('Das Tutorial wurde neu gestartet.');
  }

  function finishTutorial(skipped = false) {
    clearTimeout(tutorialTimer);
    removeTutorialHighlight();
    closeQuickMenu();
    const layer = document.getElementById('appTutorial');
    layer?.classList.remove('open');
    layer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tutorial-open');
    state.tutorialActive = false;
    state.tutorialStep = 0;
    store.tutorialCompletedVersion = TUTORIAL_VERSION;
    store.tutorialCompletedAt = new Date().toISOString();
    saveStore();
    state.view = 'home';
    state.editingUid = null;
    render();
    const previousFocus = tutorialPreviousFocus;
    tutorialPreviousFocus = null;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    toast(skipped ? 'Tutorial beendet. Du kannst es in den Einstellungen erneut starten.' : 'Tutorial abgeschlossen – du bist startklar.');
  }

  function moveTutorial(direction) {
    if (!state.tutorialActive) return;
    const nextIndex = state.tutorialStep + direction;
    if (nextIndex >= TUTORIAL_STEPS.length) {
      finishTutorial(false);
      return;
    }
    showTutorialStep(Math.max(0, nextIndex));
  }

  function quickMenuMarkup() {
    return `<div class="quick-menu-overlay" id="quickMenu" role="dialog" aria-modal="true" aria-labelledby="quickMenuTitle" aria-hidden="true">
      <button class="quick-menu-backdrop" type="button" data-action="close-quick-menu" aria-label="Übersicht schließen"></button>
      <section class="quick-menu-panel">
        <div class="quick-menu-head">
          <div><div class="eyebrow">Schnellübersicht</div><h2 id="quickMenuTitle">Alle Bereiche auf einen Blick</h2><p>Wähle direkt den gewünschten Lern-, Prüfungs- oder Verwaltungsbereich.</p></div>
          <button class="quick-menu-close" type="button" data-action="close-quick-menu" aria-label="Übersicht schließen">×</button>
        </div>
        <div class="quick-priority-list" aria-label="Gewünschte Reihenfolge der Hauptbereiche">
          <button class="quick-menu-item quick-priority-item" type="button" data-action="learn-setup"><span class="quick-order">1</span><span><strong>Lernpfad</strong><small>Direktes Lernen mit Sofortlösung</small></span></button>
          <button class="quick-menu-item quick-priority-item" type="button" data-action="exam-setup"><span class="quick-order">2</span><span><strong>Prüfpfad</strong><small>Mini-, Voll- oder eigene Prüfung</small></span></button>
          <a class="quick-menu-item quick-priority-item" href="./lernmodule.html#learn"><span class="quick-order">3</span><span><strong>Lernen nach Kategorien</strong><small>Kapitel, Merksätze und Fragen</small></span></a>
          <a class="quick-menu-item quick-priority-item" href="./lernmodule.html#cards"><span class="quick-order">4</span><span><strong>Karteikarten</strong><small>Leitner-System und eigene Karten</small></span></a>
          <button class="quick-menu-item quick-priority-item" type="button" data-action="learning-path"><span class="quick-order">5</span><span><strong>Qualitätsmanager Lernpfad</strong><small>Quellenbezogen verstehen und anwenden</small></span></button>
          <button class="quick-menu-item quick-priority-item" type="button" data-action="audit-journey"><span class="quick-order">6</span><span><strong>Interaktive Betriebsbegehung</strong><small>Auditpraxis im CARAT-Betrieb</small></span></button>
          <button class="quick-menu-item quick-priority-item" type="button" data-action="document-search" data-source="iso"><span class="quick-order">7</span><span><strong>Suchen mit ISO oder Modul</strong><small>ISO, TÜV Modul 1 oder Modul 2 auswählen</small></span></button>
          <a class="quick-menu-item quick-priority-item" href="./lernmodule.html#test"><span class="quick-order">8</span><span><strong>Testmodus</strong><small>Sofortige Auflösung und Fehlertraining</small></span></a>
          <a class="quick-menu-item quick-priority-item" href="./lernmodule.html#matrix"><span class="quick-order">9</span><span><strong>QM-Werkzeuge</strong><small>Matrizen und QM-Methoden</small></span></a>
          <a class="quick-menu-item quick-priority-item" href="./lernmodule.html#spickzettel"><span class="quick-order">10</span><span><strong>Spickzettel</strong><small>Drucken oder als PDF speichern</small></span></a>
        </div>
        <section class="quick-menu-group quick-menu-more">
          <h3>Weitere Bereiche</h3>
          <div class="quick-menu-links">
            <button class="quick-menu-item" type="button" data-action="video-guides"><span class="quick-menu-icon">▶</span><span><strong>Videoanleitungen</strong><small>${PUBLISHED_VIDEO_GUIDES.length} Ergänzungen · in Kapitel 2 und 3 integriert</small></span></button>
            <button class="quick-menu-item" type="button" data-action="statistics"><span class="quick-menu-icon">▦</span><span><strong>Daten, Fragen &amp; Statistik</strong><small>Auswerten, nachschlagen, bearbeiten und sichern</small></span></button>
            <button class="quick-menu-item" type="button" data-action="settings"><span class="quick-menu-icon">⚙</span><span><strong>Einstellungen</strong><small>Zentral verwalten</small></span></button>
            <button class="quick-menu-item" type="button" data-action="start-openbook" data-source="iso"><span class="quick-menu-icon">I</span><span><strong>ISO-Lernmodul</strong><small>Eigene PDF erforderlich</small></span></button>
            <button class="quick-menu-item" type="button" data-action="start-openbook" data-source="modul1"><span class="quick-menu-icon">1</span><span><strong>TÜV Modul 1</strong><small>Eigene PDF erforderlich</small></span></button>
            <button class="quick-menu-item" type="button" data-action="start-openbook" data-source="modul2"><span class="quick-menu-icon">2</span><span><strong>TÜV Modul 2</strong><small>Eigene PDF erforderlich</small></span></button>
            <a class="quick-menu-item" href="./lernmodule.html#shortcuts"><span class="quick-menu-icon">⌨</span><span><strong>Tastenkürzel</strong><small>Schneller bedienen</small></span></a>
          </div>
        </section>
      </section>
    </div>`;
  }

  function isStandaloneApp() {
    return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  }

  function installDeviceData() {
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.userAgentData?.platform || navigator.platform || '');
    const iOS = /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1);
    const android = /Android/i.test(ua);
    const mac = !iOS && /Mac/i.test(platform + ' ' + ua);
    const windows = /Win/i.test(platform + ' ' + ua);
    if (iOS) return {device:'iPhone oder iPad', icon:'', steps:['Die Lernplattform in Safari öffnen.','Auf „Teilen“ tippen.','„Zum Home-Bildschirm“ auswählen.','„Als Web-App öffnen“ einschalten und „Hinzufügen“ tippen.']};
    if (android) return {device:'Android', icon:'A', steps:['Die Lernplattform in Chrome öffnen.','Oben rechts das Drei-Punkte-Menü öffnen.','„Zum Startbildschirm hinzufügen“ oder „App installieren“ wählen.','Die Installation bestätigen.']};
    if (mac) return {device:'Mac', icon:'', steps:['In Safari die Lernplattform öffnen.','Auf „Teilen“ klicken oder im Menü „Ablage“ wählen.','„Zum Dock hinzufügen“ auswählen.','Mit „Hinzufügen“ bestätigen. Alternativ kann Chrome „Seite als App installieren“.']};
    if (windows) return {device:'Windows-Computer', icon:'▣', steps:['Die Lernplattform in Chrome oder Edge öffnen.','Das Installationssymbol in der Adresszeile verwenden.','Alternativ das Browsermenü öffnen und „Seite als App installieren“ wählen.','Die Installation bestätigen.']};
    return {device:'Computer', icon:'▣', steps:['Die Lernplattform in Chrome oder Edge öffnen.','Im Browsermenü „Seite als App installieren“ auswählen.','Die Installation bestätigen.','Danach startet die Lernplattform über ein eigenes App-Symbol.']};
  }

  function installHelpMarkup() {
    const info = installDeviceData();
    const installed = isStandaloneApp();
    return `<div class="install-help-overlay" id="installHelp" role="dialog" aria-modal="true" aria-labelledby="installHelpTitle" aria-hidden="true">
      <button class="install-help-backdrop" type="button" data-action="close-install-help" aria-label="Installationshinweis schließen"></button>
      <section class="install-help-panel">
        <button class="install-help-close" type="button" data-action="close-install-help" aria-label="Schließen">×</button>
        <div class="install-device-icon">${info.icon}</div>
        <div><div class="eyebrow">${installed ? 'Bereits als App geöffnet' : `Erkannt: ${info.device}`}</div><h2 id="installHelpTitle">Qualitätsmanager Lernplattform als App nutzen</h2><p>${installed ? 'Die Lernplattform läuft bereits im App-Modus.' : 'Die Installation kann vorbereitet werden. Aus Sicherheitsgründen musst du sie einmal selbst bestätigen.'}</p></div>
        <ol class="install-step-list">${info.steps.map((step,index)=>`<li><span>${index+1}</span><p>${step}</p></li>`).join('')}</ol>
        <div class="install-help-actions">
          <button class="primary-btn" id="installNowBtn" data-action="install-now" ${deferredInstall && !installed ? '' : 'hidden'}>Jetzt direkt installieren</button>
          <button class="secondary-btn" data-action="close-install-help">Verstanden</button>
        </div>
      </section>
    </div>`;
  }

  function openInstallHelp() {
    const modal = document.getElementById('installHelp');
    if (!modal) return;
    const direct = document.getElementById('installNowBtn');
    if (direct) direct.hidden = !deferredInstall || isStandaloneApp();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('install-help-open');
    setTimeout(() => (direct && !direct.hidden ? direct : modal.querySelector('.install-help-close'))?.focus(), 0);
  }

  function closeInstallHelp() {
    const modal = document.getElementById('installHelp');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('install-help-open');
  }

  function currentVideoGuide() {
    return PUBLISHED_VIDEO_GUIDES.find(guide => guide.id === state.videoGuideId) || PUBLISHED_VIDEO_GUIDES[0];
  }

  function videoGuideByNumber(number) {
    return PUBLISHED_VIDEO_GUIDES.find(guide => guide.number === number);
  }

  function publishedVideoGuidesForModule(moduleId) {
    return PUBLISHED_VIDEO_GUIDES.filter(guide => guide.moduleId === moduleId);
  }

  function videoStationForGuide(guide) {
    return ALL_VIDEO_STATIONS.find(station => station.videoNumbers.includes(guide.number));
  }

  function renderIntegratedVideoSupport(module) {
    const config = LEARNING_PATH_VIDEO_CONFIG[module.id];
    if (!config) return '';
    const moduleGuides = publishedVideoGuidesForModule(module.id);
    const watchedCount = moduleGuides.filter(item => store.videoGuideProgress?.[item.id]?.completed).length;
    const stationMarkup = config.stations.map(station => {
      const guides = station.videoNumbers.map(videoGuideByNumber).filter(Boolean);
      const watchedAtStation = guides.filter(item => store.videoGuideProgress?.[item.id]?.completed).length;
      return `<article class="path-video-station ${station.supplement ? 'supplement' : ''}">
        <div class="path-video-station-head"><div><span>${esc(station.section)}</span><h3>${esc(station.title)}</h3></div><b>${watchedAtStation}/${guides.length}</b></div>
        <p>${esc(station.description)}</p>
        <div class="path-video-links">${guides.map(guide => {
          const watched = Boolean(store.videoGuideProgress?.[guide.id]?.completed);
          return `<button class="path-video-link ${watched ? 'watched' : ''}" type="button" data-action="path-video" data-video-id="${guide.id}"><span class="path-video-number">${String(guide.pathNumber || guide.number).padStart(2,'0')}</span><span class="path-video-copy"><small>${esc(guide.section)} · ${formatVideoTime(guide.duration)}</small><strong>${esc(guide.title)}</strong></span><b class="path-video-state">${watched ? '✓' : '▶'}</b></button>`;
        }).join('')}</div>
      </article>`;
    }).join('');
    return `<details class="path-video-support" open>
      <summary><span>▶</span><strong>${esc(config.title)}</strong><b>${watchedCount}/${moduleGuides.length}</b></summary>
      <div class="path-video-support-body">
        <div class="path-video-support-head"><div><h3>Direkt in „${esc(module.title)}“ eingegliedert</h3><p>Die Lernpfadtexte und Fragen bleiben der Hauptweg. ${esc(config.intro)}</p></div><button class="ghost-btn" type="button" data-action="video-guides">Alle Videos überblicken</button></div>
        <div class="path-video-station-grid">${stationMarkup}</div>
      </div>
    </details>`;
  }

  function videoSceneIndexAt(seconds, guide = currentVideoGuide()) {
    const value = Math.max(0, Math.min(guide.duration, Number(seconds) || 0));
    const index = guide.scenes.findIndex(scene => value >= scene.start && value < scene.end);
    return index >= 0 ? index : guide.scenes.length - 1;
  }

  function formatVideoTime(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    return `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`;
  }

  function broccoliMarkup() {
    return '<span class="broccoli-mark" aria-hidden="true"><i></i><i></i><i></i><b></b></span>';
  }

  function videoVisualMarkup(type) {
    if (type === 'p1-intro') return `<div class="guide-process-equation"><article><b>E</b><span>Eingabe</span></article><i>+</i><article><b>M</b><span>Mittel</span></article><i>+</i><article><b>A</b><span>Aktivität</span></article><i>→</i><article class="result"><b>R</b><span>Ergebnis</span></article></div>`;
    if (type === 'p1-purpose') return `<div class="guide-purpose"><div class="loose-actions"><span>wiegen</span><span>prüfen</span><span>packen</span></div><i>→</i><div class="purpose-target"><small>GEMEINSAMER ZWECK</small><strong>Spezifiziertes Ergebnis</strong><b>◎</b></div></div>`;
    if (type === 'p1-input') return `<div class="guide-process-focus input"><div class="focus-label">EINGABEN</div><div class="focus-cards"><span>❄ TK-Gemüse</span><span>▤ Kundenauftrag</span><span>◇ Spezifikation</span></div><i>→ Prozess</i></div>`;
    if (type === 'p1-means') return `<div class="guide-process-focus means"><div class="focus-label">MITTEL</div><div class="means-wheel"><b>⚙</b><span>Personal</span><span>Waage</span><span>Anlage</span><span>Methode</span></div><small>ermöglichen die Bearbeitung</small></div>`;
    if (type === 'p1-activity') return `<div class="guide-activity-strip"><span><b>1</b>portionieren</span><i>→</i><span><b>2</b>wiegen</span><i>→</i><span><b>3</b>prüfen</span><i>→</i><span><b>4</b>verpacken</span></div>`;
    if (type === 'p1-result') return `<div class="guide-result-pack"><div class="pack-shape"><b>CARAT</b><span>TK-GEMÜSE</span></div><div class="pack-checks"><span>✓ Füllmenge</span><span>✓ Prüfung</span><span>✓ Kennzeichnung</span><strong>SPEZIFIZIERT</strong></div></div>`;
    if (type === 'p1-recap') return `<div class="guide-four-questions"><span>Was hinein?<b>E</b></span><span>Womit?<b>M</b></span><span>Was geschieht?<b>A</b></span><span>Was heraus?<b>R</b></span><strong>VOLLSTÄNDIGER PROZESS</strong></div>`;
    if (type === 'p2-intro') return `<div class="guide-process-compare"><article class="production"><small>PRODUKTION</small><b>▣</b><strong>Produkt</strong></article><span>ODER</span><article class="service"><small>DIENSTLEISTUNG</small><b>↗</b><strong>Leistung</strong></article></div>`;
    if (type === 'p2-shared') return `<div class="guide-shared-logic"><div><span>Eingabe</span><i>→</i><span>Prozess</span><i>→</i><span>Ergebnis</span></div><section><b>▣ Produkt</b><b>↗ Leistung</b></section><strong>GLEICHE PROZESSLOGIK</strong></div>`;
    if (type === 'p2-production') return `<div class="guide-production-line"><span class="raw">❄ Rohware</span><i>→</i><div><b>portionieren</b><b>prüfen</b><b>verpacken</b></div><i>→</i><span class="finished">▣ CARAT-Packung</span></div>`;
    if (type === 'p2-service') return `<div class="guide-service-flow"><span>▤ Bestellung</span><i>→</i><div><b>prüfen</b><b>abstimmen</b><b>koordinieren</b></div><i>→</i><span>✓ Auftrag erfüllt</span></div>`;
    if (type === 'p2-inputs') return `<div class="guide-input-compare"><article><small>PRODUKTION</small><b>❄</b><span>Material</span><span>Spezifikation</span></article><article><small>DIENSTLEISTUNG</small><b>▤</b><span>Bestellung</span><span>Terminbedarf</span></article></div>`;
    if (type === 'p2-results') return `<div class="guide-result-compare"><article><b>▣</b><strong>greifbares Produkt</strong><small>Packung vorhanden</small></article><article><b>✓</b><strong>erbrachte Leistung</strong><small>Wirkung nachweisbar</small></article></div>`;
    if (type === 'p2-recap') return `<div class="guide-compare-recap"><span><small>PRODUKTIONSPROZESS</small><b>materielles Produkt</b></span><i>≠</i><span><small>DIENSTLEISTUNGSPROZESS</small><b>vereinbarte Leistung</b></span><strong>BEIDES SIND PROZESSE</strong></div>`;
    if (type === 'p3-intro') return `<div class="guide-flow-choice"><article><small>NACHEINANDER</small><div><b>1</b><i>→</i><b>2</b><i>→</i><b>3</b></div></article><span>ODER</span><article><small>GLEICHZEITIG</small><div class="parallel"><b>A</b><b>B</b><b>C</b></div></article></div>`;
    if (type === 'p3-sequential') return `<div class="guide-sequential"><span><b>1</b>füllen</span><i>→</i><span><b>2</b>wiegen</span><i>→</i><span><b>3</b>freigeben</span><i>→</i><span><b>4</b>verschließen</span></div>`;
    if (type === 'p3-dependency') return `<div class="guide-dependency"><div class="dependency-value"><small>MESSWERT</small><strong>500 g</strong></div><i>→</i><div class="dependency-gate"><b>✓</b><span>Freigabe</span></div><div class="dependency-lock">OHNE WERT<br><b>KEINE FREIGABE</b></div></div>`;
    if (type === 'p3-parallel') return `<div class="guide-parallel-flow"><span>START</span><div><b>Etiketten vorbereiten</b><b>Unterlagen erstellen</b><b>Ware bereitstellen</b></div><span>TREFFPUNKT</span></div>`;
    if (type === 'p3-decision') return `<div class="guide-decision-card"><small>ENTSCHEIDUNGSFRAGE</small><strong>Braucht B zwingend<br>das Ergebnis von A?</strong><div><span class="yes">JA → sequentiell</span><span class="no">NEIN → parallel möglich</span></div></div>`;
    if (type === 'p3-hybrid') return `<div class="guide-hybrid-flow"><div class="hybrid-split"><span>Etikett</span><span>Unterlagen</span><span>Ware</span></div><i>⇣</i><strong>PRÜFPUNKT</strong><i>⇣</i><div class="hybrid-end">Freigabe → Verschluss</div></div>`;
    if (type === 'p3-recap') return `<div class="guide-flow-recap"><article><b>→</b><strong>SEQUENTIELL</strong><span>Ergebnis des Vorgängers nötig</span></article><article><b>⇉</b><strong>PARALLEL</strong><span>Tätigkeiten voneinander unabhängig</span></article><small>ABHÄNGIGKEIT ENTSCHEIDET</small></div>`;
    if (type === 'p4-intro') return `<div class="guide-management-contrast"><article><b>▤</b><strong>einmal beschrieben</strong><span class="cross">×</span></article><article class="active"><b>↻</b><strong>dauerhaft gelenkt</strong><span class="check">✓</span></article></div>`;
    if (type === 'p4-cycle') return `<div class="guide-five-cycle"><span class="c1">Festlegen</span><span class="c2">Messbar</span><span class="c3">Umsetzen</span><span class="c4">Bewerten</span><span class="c5">Verbessern</span><b>↻</b></div>`;
    if (type === 'p4-define') return `<div class="guide-cycle-focus"><span>1</span><div><small>FESTLEGEN</small><strong>Zweck · Ergebnis · Vorgehen</strong><i></i><i></i><i></i></div></div>`;
    if (type === 'p4-measure') return `<div class="guide-cycle-focus measure"><span>2</span><div><small>MESSBAR MACHEN</small><strong>Füllmenge zuverlässig?</strong><div class="mini-gauge"><i></i><b>500 g</b></div></div></div>`;
    if (type === 'p4-implement') return `<div class="guide-cycle-focus implement"><span>3</span><div><small>UMSETZEN</small><strong>Plan wird gelebter Ablauf</strong><div class="implementation-row"><b>Plan</b><i>→</i><b>Arbeit</b><i>→</i><b>Ergebnis</b></div></div></div>`;
    if (type === 'p4-evaluate') return `<div class="guide-cycle-focus evaluate"><span>4</span><div><small>BEWERTEN</small><strong>Entwicklung statt Einzelfall</strong><div class="evaluation-bars"><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
    if (type === 'p4-improve') return `<div class="guide-improvement-loop"><span>Bewerten</span><i>→</i><span>Verbessern</span><i>→</i><span>neu beobachten</span><b>↻</b><strong>PROZESS BLEIBT WIRKSAM</strong></div>`;
    if (type === 'p5-intro') return `<div class="guide-dual-direction"><span class="customer">KUNDENBEDARF<i>→</i></span><strong>PROZESS</strong><span class="company"><i>←</i>UNTERNEHMENSZIEL</span><b>gemeinsame Richtung</b></div>`;
    if (type === 'p5-customer') return `<div class="guide-direction-focus customer"><b>K</b><div><small>KUNDENBEDÜRFNIS</small><strong>richtige Ware</strong><span>vollständig</span><span>pünktlich</span></div></div>`;
    if (type === 'p5-company') return `<div class="guide-direction-focus company"><b>U</b><div><small>UNTERNEHMENSZIEL</small><strong>stabile Leistung</strong><span>geringe Verluste</span><span>lieferfähig</span></div></div>`;
    if (type === 'p5-misaligned') return `<div class="guide-misaligned"><div class="speed">SCHNELL<b>⚡</b><span>12 Minuten</span></div><i>≠</i><div class="wrong-result">FALSCHES ERGEBNIS<b>!</b><span>Gebinde · Termin</span></div></div>`;
    if (type === 'p5-carat') return `<div class="guide-target-meeting"><span>Kunde<br><b>richtig + pünktlich</b></span><i>→</i><strong>CARAT<br>PROZESS</strong><i>←</i><span>Unternehmen<br><b>stabil + effizient</b></span></div>`;
    if (type === 'p5-filter') return `<div class="guide-change-filter"><small>PROZESSÄNDERUNG</small><strong>Neue Verpackungslinie</strong><div><span>✓ Kundenleistung?</span><span>✓ Unternehmensziel?</span></div><b>BEIDE PRÜFEN</b></div>`;
    if (type === 'p5-recap') return `<div class="guide-alignment-recap"><span><b>K</b>Kundennutzen</span><i>+</i><span><b>U</b>Unternehmensbeitrag</span><i>→</i><strong>AUSGERICHTETER PROZESS</strong></div>`;
    if (type === 'p6-intro') return `<div class="guide-process-cockpit"><span><b>M</b>Methode</span><span><b>K</b>Indikator</span><span><b>R</b>Ressourcen</span><span><b>V</b>Verantwortung</span><span><b>B</b>Befugnis</span><strong>STEUERBAR</strong></div>`;
    if (type === 'p6-method') return `<div class="guide-control-focus"><b>M</b><div><small>METHODE</small><strong>Wie wird geprüft?</strong><span>Probe nehmen</span><span>wiegen</span><span>Wert behandeln</span></div></div>`;
    if (type === 'p6-kpi') return `<div class="guide-control-focus kpi"><b>K</b><div><small>LEISTUNGSINDIKATOR</small><strong>Anteil korrekter Packungen</strong><div class="kpi-line"><i></i><i></i><i></i><i></i><i></i><span>98 %</span></div></div></div>`;
    if (type === 'p6-resources') return `<div class="guide-resource-grid"><span>👤<b>Personal</b></span><span>◷<b>Zeit</b></span><span>⚙<b>Anlage</b></span><span>⚖<b>Waage</b></span><strong>RESSOURCEN VERFÜGBAR?</strong></div>`;
    if (type === 'p6-responsibility') return `<div class="guide-role-card"><div class="role-person">PV</div><div><small>VERANTWORTUNG</small><strong>beobachten</strong><span>bewerten</span><span>Reaktion veranlassen</span></div></div>`;
    if (type === 'p6-authority') return `<div class="guide-authority"><span>ABWEICHUNG</span><i>→</i><div><b>STOPP</b><strong>Entscheidungsrecht</strong><small>Linie stoppen · Ware sperren</small></div></div>`;
    if (type === 'p6-recap') return `<div class="guide-control-recap"><span><b>M</b>wie?</span><span><b>K</b>wie gut?</span><span><b>R</b>womit?</span><span><b>V</b>wer handelt?</span><span><b>B</b>wer entscheidet?</span><strong>PROZESS-COCKPIT</strong></div>`;
    if (type === 'p7-intro') return `<div class="guide-process-chain"><span>Auftrag</span><i>→</i><span>Herstellung</span><i>→</i><span>Bereitstellung</span><i>→</i><span>Kunde</span><strong>VERBUNDENE PROZESSE</strong></div>`;
    if (type === 'p7-boundary') return `<div class="guide-boundary"><b>START</b><span>freigegebener<br>Produktionsauftrag</span><div>PROZESS</div><span>geprüfte Ware<br>bereitgestellt</span><b>ENDE</b></div>`;
    if (type === 'p7-purpose') return `<div class="guide-purpose-result"><article><small>ZWECK</small><b>Warum?</b><strong>Ware spezifikationsgerecht bereitstellen</strong></article><i>→</i><article><small>ERGEBNIS</small><b>Was?</b><strong>geprüfte Charge verfügbar</strong></article></div>`;
    if (type === 'p7-recipient') return `<div class="guide-recipient"><div class="result-box">ERGEBNIS</div><i>→</i><article><b>I</b><span>interner Empfänger</span><strong>Versandbereich</strong></article><article><b>E</b><span>externer Empfänger</span><strong>Großhändler</strong></article></div>`;
    if (type === 'p7-interface') return `<div class="guide-interface"><article><small>PROZESS A</small><strong>ERGEBNIS</strong></article><div><b>⇄</b><span>SCHNITTSTELLE</span></div><article><small>PROZESS B</small><strong>EINGABE</strong></article></div>`;
    if (type === 'p7-handover') return `<div class="guide-handover"><span>▣ Charge 08-26</span><span>▤ Menge 240</span><span>✓ Freigabe</span><i>→</i><strong>VERSAND KANN STARTEN</strong></div>`;
    if (type === 'p7-recap') return `<div class="guide-boundary-recap"><span><b>|</b>Grenze</span><span><b>◎</b>Empfänger</span><span><b>⇄</b>Schnittstelle</span><strong>ÜBERGABE NUTZBAR?</strong></div>`;
    if (type === 'p8-intro') return `<div class="guide-process-types"><span class="lead">FÜHRUNG</span><span class="core">KERN</span><span class="support">UNTERSTÜTZUNG</span><strong>DREI PROZESSARTEN</strong></div>`;
    if (type === 'p8-core') return `<div class="guide-core-flow"><b>KUNDE</b><i>→</i><span>Auftrag</span><i>→</i><span>Herstellung</span><i>→</i><span>Lieferung</span><i>→</i><b>KUNDE</b></div>`;
    if (type === 'p8-support') return `<div class="guide-support-base"><div class="core-bar">KERNPROZESS</div><span>Beschaffung</span><span>Instandhaltung</span><span>Prüfmittel</span><i>↑</i><i>↑</i><i>↑</i><strong>ermöglichen</strong></div>`;
    if (type === 'p8-leadership') return `<div class="guide-leadership-roof"><span>Strategie</span><span>Ziele</span><span>Budget</span><span>Personal</span><div>↓ RICHTUNG UND RAHMEN ↓</div><strong>PROZESSLANDSCHAFT</strong></div>`;
    if (type === 'p8-landscape') return `<div class="guide-process-landscape"><div class="top">FÜHRUNG · ausrichten</div><div class="middle">KUNDE → KERNPROZESS → KUNDE</div><div class="bottom">UNTERSTÜTZUNG · ermöglichen</div></div>`;
    if (type === 'p8-classify') return `<div class="guide-classification"><span class="org">ABTEILUNG?</span><b>≠</b><span class="effect">WIRKUNG DES PROZESSES</span><div><i>Wert schaffen</i><i>ermöglichen</i><i>ausrichten</i></div></div>`;
    if (type === 'p8-recap') return `<div class="guide-types-recap"><span><b>K</b>schafft Wert</span><span><b>U</b>ermöglicht</span><span><b>F</b>richtet aus</span><strong>ORGANISATION FUNKTIONIERT</strong></div>`;
    if (type === 'p9-intro') return `<div class="guide-iso-system"><span>4 Kontext</span><span>5 Führung</span><span>6 Planung</span><span>7/8 Umsetzung</span><span>9 Bewertung</span><span>10 Verbesserung</span><strong>ISO 9001 · VERBUNDENES SYSTEM</strong></div>`;
    if (type === 'p9-not-map') return `<div class="guide-model-contrast"><article><small>NORMMODELL</small><b>4–10</b><strong>Anforderungen verknüpft</strong><span>✓</span></article><i>≠</i><article><small>PROZESSLANDKARTE</small><b>⚙</b><strong>betriebliche Einzelprozesse</strong><span>nicht dargestellt</span></article></div>`;
    if (type === 'p9-inputs') return `<div class="guide-model-inputs"><span>Kontext der Organisation</span><span>Kundenanforderungen</span><span>interessierte Parteien</span><i>→</i><strong>QMS</strong></div>`;
    if (type === 'p9-sections') return `<div class="guide-iso-sections"><span class="context">4<br><small>Kontext</small></span><div><b>5 Führung</b><b>6 Planung</b><b>7/8 Umsetzung</b><b>9 Bewertung</b><b>10 Verbesserung</b></div></div>`;
    if (type === 'p9-outputs') return `<div class="guide-model-outputs"><strong>QMS</strong><i>→</i><span>Produkte</span><span>Dienstleistungen</span><span>Kundenzufriedenheit</span></div>`;
    if (type === 'p9-reading') return `<div class="guide-model-reading"><span>ANFORDERUNGEN</span><i>→</i><strong>VERBUNDENES QMS</strong><i>→</i><span>ERGEBNISSE</span><b>↶ Rückmeldung</b></div>`;
    if (type === 'p9-recap') return `<div class="guide-model-recap"><span>Eingänge</span><i>+</i><span>Normabschnitte 4–10</span><i>+</i><span>Ergebnisse</span><strong>ZUSAMMENHANG STATT EINZELKAPITEL</strong></div>`;
    if (type === 'p10-intro') return `<div class="guide-pdca-wheel"><span class="plan">PLAN</span><span class="do">DO</span><span class="check">CHECK</span><span class="act">ACT</span><b>↻</b><strong>QMS + TEILPROZESSE</strong></div>`;
    if (type === 'p10-plan') return `<div class="guide-pdca-focus plan"><b>P</b><div><small>PLAN</small><span>Ziele</span><span>Ressourcen</span><span>Anforderungen</span><span>Risiken & Chancen</span></div></div>`;
    if (type === 'p10-do') return `<div class="guide-pdca-focus do"><b>D</b><div><small>DO</small><strong>GEPLANTES UMSETZEN</strong><span>Vorgaben + Menschen + Mittel</span><i>⚙</i></div></div>`;
    if (type === 'p10-check') return `<div class="guide-pdca-focus check"><b>C</b><div><small>CHECK</small><span>überwachen</span><span>messen</span><span>vergleichen</span><span>berichten</span></div></div>`;
    if (type === 'p10-act') return `<div class="guide-pdca-focus act"><b>A</b><div><small>ACT</small><strong>LEISTUNG VERBESSERN</strong><span>Erkenntnis → Maßnahme → neuer Plan</span></div></div>`;
    if (type === 'p10-carat') return `<div class="guide-carat-pdca"><span><b>P</b>Füllmenge planen</span><span><b>D</b>abfüllen</span><span><b>C</b>Abweichung auswerten</span><span><b>A</b>nachsteuern</span><strong>↻ NÄCHSTER DURCHLAUF</strong></div>`;
    if (type === 'p10-recap') return `<div class="guide-pdca-recap"><span>PLANEN</span><i>→</i><span>DURCHFÜHREN</span><i>→</i><span>PRÜFEN</span><i>→</i><span>HANDELN</span><b>↻</b><strong>LERNENDES PROZESSSYSTEM</strong></div>`;
    if (type === 'intro') return `<div class="guide-intro-visual"><div class="guide-orbit orbit-a"></div><div class="guide-orbit orbit-b"></div><div class="guide-q-block">Q</div><div class="guide-topic-pill">Qualität verstehen</div></div>`;
    if (type === 'compare') return `<div class="guide-compare"><article class="guide-crate crate-ok"><span class="crate-label">Lieferung A</span>${broccoliMarkup()}<strong>−18 °C</strong><small>Anforderungen erfüllt</small></article><div class="guide-versus">?</div><article class="guide-crate crate-warn"><span class="crate-label">Lieferung B</span>${broccoliMarkup()}<strong>−8 °C</strong><small>Temperatur abweichend</small></article></div>`;
    if (type === 'definition') return `<div class="guide-formula"><div class="formula-card"><span>Merkmale</span><b>Temperatur · Zustand · Leistung</b></div><div class="formula-link">erfüllen?</div><div class="formula-card accent"><span>Anforderungen</span><b>Soll · Vorgabe · Erwartung</b></div></div>`;
    if (type === 'requirements') return `<div class="guide-requirement-grid"><article><div class="req-symbol">K</div><strong>Kunde</strong><span>Vereinbarte Leistung</span></article><article><div class="req-symbol">§</div><strong>Recht</strong><span>Sicherheit und Vorgaben</span></article><article><div class="req-symbol">O</div><strong>Organisation</strong><span>Eigene Standards</span></article></div>`;
    if (type === 'carat') return `<div class="guide-carat"><div class="carat-brand">CARAT <span>Landfrische</span></div><div class="carat-product">${broccoliMarkup()}<strong>TK-Brokkoli</strong></div><div class="carat-checks"><span><b>✓</b> −18 °C</span><span><b>✓</b> Schnittgröße</span><span><b>✓</b> sauber</span><span><b>✓</b> pünktlich</span></div></div>`;
    if (type === 'system') return `<div class="guide-system-flow"><div><b>1</b><span>Festlegen</span></div><i>→</i><div><b>2</b><span>Umsetzen</span></div><i>→</i><div><b>3</b><span>Prüfen</span></div><i>→</i><div><b>4</b><span>Verbessern</span></div></div>`;
    if (type === 'responsibility-intro') return `<div class="guide-role-orbit"><div class="role-center">Q</div><span class="role-node role-top">Leitung</span><span class="role-node role-right">Prozess</span><span class="role-node role-bottom">Mitarbeitende</span><span class="role-node role-left">QMB</span></div>`;
    if (type === 'quality-myth') return `<div class="guide-quality-myth"><article class="myth-qmb"><span>QMB</span><strong>macht alles?</strong></article><div class="myth-sign">≠</div><article class="myth-team"><span>TEAM</span><strong>geteilte Rollen</strong><div><i>L</i><i>P</i><i>M</i><i>Q</i></div></article></div>`;
    if (type === 'quality-leadership') return `<div class="guide-leadership"><div class="leadership-top"><span>LEITUNG</span><strong>Richtung geben</strong></div><div class="leadership-beams"><span>Ziele</span><span>Rollen</span><span>Ressourcen</span></div><div class="leadership-base">QMS wirksam betreiben</div></div>`;
    if (type === 'quality-process') return `<div class="guide-process-card"><div class="process-owner">PV</div><div class="process-route"><span><b>1</b>Anforderung</span><i>→</i><span><b>2</b>Ablauf</span><i>→</i><span><b>3</b>Kennzahl</span></div><div class="process-alert">Abweichung → reagieren</div></div>`;
    if (type === 'quality-employee') return `<div class="guide-employee-scene"><div class="employee-thermometer"><span>−12 °C</span><i></i></div><div class="employee-action"><span class="employee-eye">◉</span><strong>Abweichung erkannt</strong><div>melden · sichern · dokumentieren</div></div></div>`;
    if (type === 'quality-qmb') return `<div class="guide-qmb-hub"><div class="qmb-hub-center"><strong>QMB</strong><span>verbindet</span></div><span class="hub-node hub-a">Audit</span><span class="hub-node hub-b">Daten</span><span class="hub-node hub-c">Bereiche</span><span class="hub-node hub-d">Verbesserung</span></div>`;
    if (type === 'team-recap') return `<div class="guide-team-recap"><div class="team-role-row"><span><b>L</b>ermöglicht</span><span><b>P</b>steuert</span><span><b>M</b>handelt</span><span><b>Q</b>verbindet</span></div><strong>Qualität entsteht<br>im gesamten Team.</strong></div>`;
    if (type === 'correction-intro') return `<div class="guide-correction-intro"><article><span>K</span><strong>Korrektur</strong><small>aktuellen Fall beheben</small></article><div>≠</div><article class="accent"><span>KM</span><strong>Korrekturmaßnahme</strong><small>Wiederholung verhindern</small></article></div>`;
    if (type === 'label-mixup') return `<div class="guide-label-case"><div class="label-product"><span>CARAT</span><strong>TK-MANGO</strong><small>Charge 08-26</small></div><div class="wrong-label"><span>ETIKETT</span><strong>ERDBEEREN</strong><b>!</b></div><div class="label-stop">CHARGE GESTOPPT</div></div>`;
    if (type === 'correction-fix') return `<div class="guide-correction-fix"><div class="fix-step"><b>1</b><span>stoppen</span></div><i>→</i><div class="fix-step"><b>2</b><span>Etikett entfernen</span></div><i>→</i><div class="fix-step"><b>3</b><span>neu kennzeichnen</span></div><div class="fix-result">✓ aktueller Fall behoben</div></div>`;
    if (type === 'correction-limit') return `<div class="guide-correction-loop"><div class="loop-package">MANGO<span>falsches Etikett</span></div><div class="loop-arrow">↻</div><div class="loop-warning"><strong>MORGEN?</strong><span>Ursache noch vorhanden</span></div></div>`;
    if (type === 'root-cause') return `<div class="guide-root-cause"><div class="file-stack"><span><b>PDF</b>etikett_mango_final</span><span><b>PDF</b>etikett_erdbeere_final</span></div><div class="cause-search">⌕</div><div class="cause-found"><strong>URSACHE</strong><span>ähnliche Namen</span><span>keine Freigabe</span></div></div>`;
    if (type === 'corrective-action') return `<div class="guide-corrective-action"><div class="coded-file"><span>DATEICODE</span><strong>MNG-0826-DE</strong></div><div class="barcode-scan"><i></i><b>✓</b><span>Barcode-Abgleich</span></div><div class="print-release">DRUCK FREIGEGEBEN</div></div>`;
    if (type === 'correction-recap') return `<div class="guide-correction-recap"><div><span>KORREKTUR</span><strong>Fall beheben</strong><small>hier und jetzt</small></div><i>+</i><div><span>KORREKTURMASSNAHME</span><strong>Ursache beseitigen</strong><small>Wiederholung verhindern</small></div><b>✓ WIRKSAMKEIT NACHWEISEN</b></div>`;
    if (type === 'cost-intro') return `<div class="guide-cost-intro"><div class="cost-defect">!</div><div class="cost-wave"><span>Zeit</span><span>Material</span><span>Geld</span></div></div>`;
    if (type === 'cost-iceberg') return `<div class="guide-cost-iceberg"><div class="iceberg-tip"><span>defekter Beutel</span></div><div class="iceberg-water"></div><div class="iceberg-hidden"><span>Suchzeit</span><span>Stillstand</span><span>Prüfung</span><span>Nacharbeit</span><span>Material</span></div></div>`;
    if (type === 'internal-costs') return `<div class="guide-cost-panel internal"><div class="cost-panel-head">INTERN ENTDECKT</div><div class="cost-items"><span>▣ Ware sperren</span><span>↺ nacharbeiten</span><span>✓ erneut prüfen</span><span>◷ Verzögerung</span></div></div>`;
    if (type === 'external-costs') return `<div class="guide-cost-panel external"><div class="cost-panel-head">BEIM KUNDEN ENTDECKT</div><div class="cost-items"><span>↩ Rücktransport</span><span>⇢ Ersatzlieferung</span><span>☎ Reklamation</span><span>♡ Vertrauen</span></div></div>`;
    if (type === 'efficiency-savings') return `<div class="guide-efficiency"><div class="eff-before"><b>VORHER</b><span>Arbeit</span><i>↻</i><span>Doppelarbeit</span><i>…</i><span>Wartezeit</span></div><div class="eff-arrow">→</div><div class="eff-after"><b>KLARER ABLAUF</b><span>weniger Zeit</span><span>weniger Bestand</span><span>weniger Material</span></div></div>`;
    if (type === 'quality-investment') return `<div class="guide-investment"><article><span>PLANBAR</span><strong>Nahtprüfung</strong><small>kleiner, kontrollierter Aufwand</small></article><div class="invest-vs">oder</div><article class="risk"><span>ÜBERRASCHUNG</span><strong>Auftrag zurück</strong><small>viele Folgekosten</small></article></div>`;
    if (type === 'cost-recap') return `<div class="guide-cost-recap"><div class="receipt-lines"><span>Zeit</span><span>Material</span><span>Nacharbeit</span><span>Reklamation</span></div><strong>Schlechte Qualität<br>kommt später auf die Rechnung.</strong><b>VERMEIDBARE VERLUSTE SICHTBAR MACHEN</b></div>`;
    if (type === 'kano-intro') return `<div class="guide-kano-intro"><div class="kano-face bad">−</div><div class="kano-face neutral">•</div><div class="kano-face delight">★</div><span>enttäuscht · neutral · begeistert</span></div>`;
    if (type === 'kano-axis') return `<div class="guide-kano-axis"><div class="axis-y">Zufriedenheit ↑</div><div class="axis-x">Erfüllung →</div><i class="curve-basic"></i><i class="curve-performance"></i><i class="curve-delight"></i><span class="axis-label a">Basis</span><span class="axis-label b">Leistung</span><span class="axis-label c">Begeisterung</span></div>`;
    if (type === 'kano-basic') return `<div class="guide-kano-card basic"><span>BASIS</span><div class="kano-package">CARAT<small>vollständig · unbeschädigt</small></div><div class="kano-effect"><b>fehlt</b><i>→</i><strong>unzufrieden</strong><b>erfüllt</b><i>→</i><strong>neutral</strong></div></div>`;
    if (type === 'kano-performance') return `<div class="guide-kano-card performance"><span>LEISTUNG</span><div class="size-options"><b>S</b><b>M</b><b>L</b></div><strong>flexible Gebindegrößen</strong><div class="performance-meter"><i></i></div><small>mehr Erfüllung → mehr Zufriedenheit</small></div>`;
    if (type === 'kano-delight') return `<div class="guide-kano-card delight"><span>BEGEISTERUNG</span><div class="qr-demo"><i></i><b>QR</b></div><div class="qr-info"><strong>Herkunft</strong><strong>Erntedatum</strong><strong>Nachweise</strong></div><small>unerwarteter Zusatznutzen</small></div>`;
    if (type === 'kano-shift') return `<div class="guide-kano-shift"><div><b>★</b><span>heute</span><strong>Begeisterung</strong></div><i>→</i><div><b>↗</b><span>morgen</span><strong>Leistung</strong></div><i>→</i><div><b>✓</b><span>später</span><strong>Basis</strong></div></div>`;
    if (type === 'kano-recap') return `<div class="guide-kano-recap"><div><b>B</b><span>Basis</span><small>verhindert Unzufriedenheit</small></div><div><b>L</b><span>Leistung</span><small>steigert Zufriedenheit</small></div><div><b>★</b><span>Begeisterung</span><small>überrascht positiv</small></div></div>`;
    if (type === 'qm-toolbox-intro') return `<div class="guide-qm-orbit"><div class="qm-orbit-core">QM</div><span class="qm-orbit-node n1">Richtung</span><span class="qm-orbit-node n2">Planung</span><span class="qm-orbit-node n3">Steuerung</span><span class="qm-orbit-node n4">Sicherung</span><span class="qm-orbit-node n5">Verbesserung</span></div>`;
    if (type === 'qm-direction') return `<div class="guide-qm-direction"><div class="direction-compass"><i></i><b>N</b></div><div class="direction-stack"><span>QUALITÄTSPOLITIK</span><strong>grundsätzliche Richtung</strong><i>↓</i><span>QUALITÄTSZIELE</span><strong>konkret und greifbar</strong></div></div>`;
    if (type === 'qm-planning') return `<div class="guide-qm-blueprint"><div class="blueprint-title">NEUE TK-MISCHUNG · PLAN</div><div class="blueprint-grid"><span><b>01</b>Rezeptur</span><span><b>02</b>Temperatur</span><span><b>03</b>Mittel</span><span><b>04</b>Prüfpunkte</span></div><div class="blueprint-ready">VOR DEM START FESTGELEGT</div></div>`;
    if (type === 'qm-control') return `<div class="guide-qm-control"><div class="control-live"><span>LIVE</span><b>−18 °C</b><small>Sollbereich eingehalten</small></div><div class="control-track"><i></i><i></i><i></i><i></i><i></i><b>SOLL</b></div><div class="control-action">Abweichung → Ablauf anpassen</div></div>`;
    if (type === 'qm-assurance') return `<div class="guide-qm-assurance"><div class="assurance-shield">✓</div><div class="assurance-docs"><span><b>V</b>freigegebenes Verfahren</span><span><b>P</b>geeignetes Prüfmittel</span><span><b>N</b>nachvollziehbarer Nachweis</span></div><strong>VERTRAUEN IN WIEDERHOLBARKEIT</strong></div>`;
    if (type === 'qm-improvement') return `<div class="guide-qm-improvement"><div class="improve-data"><span>DATEN</span><i></i><i></i><i></i><i></i></div><div class="improve-stairs"><span>stabiler</span><span>einfacher</span><span>leistungsfähiger</span></div><b>↗</b></div>`;
    if (type === 'qm-components-recap') return `<div class="guide-qm-recap"><div><b>R</b><span>Richtung</span></div><i>→</i><div><b>P</b><span>Planung</span></div><i>→</i><div><b>S</b><span>Steuerung</span></div><i>→</i><div><b>✓</b><span>Sicherung</span></div><i>→</i><div><b>↗</b><span>Verbesserung</span></div></div>`;
    if (type === 'chain-intro') return `<div class="guide-quality-journey"><div class="journey-track"></div><span class="journey-stop s1">Entwurf</span><span class="journey-stop s2">Klärung</span><span class="journey-stop s3">Erbringung</span><span class="journey-stop s4">Betreuung</span><div class="journey-box">CARAT</div></div>`;
    if (type === 'chain-trap') return `<div class="guide-core-trap"><div class="trap-fade"><span>Entwicklung</span><span>Klärung</span></div><div class="trap-core">KERNLEISTUNG<strong>allein?</strong></div><div class="trap-fade"><span>Abwicklung</span><span>Service</span></div><b>NICHT GENUG</b></div>`;
    if (type === 'chain-development') return `<div class="guide-development-board"><div class="dev-product"><span>MANGO</span><i>+</i><span>BROKKOLI</span></div><div class="dev-specs"><b>SPEZIFIKATION</b><span>Rezeptur</span><span>Stückgrößen</span><span>Verpackung</span></div><strong>GRUNDLAGE FESTGELEGT</strong></div>`;
    if (type === 'chain-sales') return `<div class="guide-sales-clarify"><div class="sales-customer"><b>KUNDE</b><span>„passende Gebinde und feste Lieferfolge“</span></div><div class="sales-focus">?</div><div class="sales-order"><b>GEKLÄRT</b><span>Größe</span><span>Menge</span><span>Rhythmus</span></div></div>`;
    if (type === 'chain-contract') return `<div class="guide-feasibility"><div class="feas-check"><span>✓ Rohware</span><span>✓ Anlage</span><span>✓ Termin</span><strong>MACHBAR</strong></div><div class="feas-arrow">→</div><div class="feas-contract"><b>VEREINBARUNG</b><span>Menge</span><span>Ausführung</span><span>Liefertermin</span><i>✎</i></div></div>`;
    if (type === 'chain-service') return `<div class="guide-service-after"><div class="service-delivery"><span>CARAT</span><strong>GELIEFERT</strong><i>✓</i></div><div class="service-plus">+</div><div class="service-care"><b>BETREUUNG</b><span>Information</span><span>erreichbar</span><span>zügige Antwort</span></div></div>`;
    if (type === 'chain-recap') return `<div class="guide-journey-recap"><div class="journey-recap-line"></div><span><b>1</b>Entwicklung</span><span><b>2</b>Klärung</span><span><b>3</b>Machbarkeit</span><span><b>4</b>Vereinbarung</span><span><b>5</b>Erbringung</span><span><b>6</b>Betreuung</span></div>`;
    if (type === 'qms-intro') return `<div class="guide-qms-network"><div class="qms-network-core">QMS</div><span class="qms-net-node a">Einkauf</span><span class="qms-net-node b">Herstellung</span><span class="qms-net-node c">Lager</span><span class="qms-net-node d">Vertrieb</span><i></i></div>`;
    if (type === 'qms-parts') return `<div class="guide-system-parts"><div class="loose-parts"><span>E</span><span>H</span><span>L</span><span>V</span><small>nur gesammelt</small></div><div class="parts-arrow">→</div><div class="joined-parts"><span>E</span><span>H</span><span>L</span><span>V</span><small>gezielt verbunden</small></div></div>`;
    if (type === 'qms-links') return `<div class="guide-qms-links"><div class="link-change">ÄNDERUNG</div><div class="link-grid"><span>Verpackung</span><span>Material</span><span>Lagerung</span><span>Auslieferung</span></div><i class="link-line l1"></i><i class="link-line l2"></i><i class="link-line l3"></i><i class="link-line l4"></i></div>`;
    if (type === 'qms-carat-flow') return `<div class="guide-qms-flow"><div class="flow-message">NEUE KARTONGRÖSSE</div><div class="flow-departments"><span><b>V</b>Vertrieb</span><i>→</i><span><b>E</b>Einkauf</span><i>→</i><span><b>P</b>Verpackung</span><i>→</i><span><b>L</b>Lager</span></div><strong>1 FREIGEGEBENER INFORMATIONSSTAND</strong></div>`;
    if (type === 'qms-break') return `<div class="guide-qms-break"><div class="break-flow"><span>neue Größe</span><i>→</i><b>×</b><i class="muted">···</i><span class="old">altes Palettenmuster</span></div><div class="break-result"><strong>TEILE KORREKT</strong><b>ABER</b><strong>GESAMTABLAUF GESTÖRT</strong></div></div>`;
    if (type === 'qms-coordinate') return `<div class="guide-qms-coordinate"><div class="coord-center"><b>FREIGEGEBEN</b><span>ein gemeinsamer Stand</span></div><div class="coord-spokes"><span>Übergabe</span><span>Rückmeldung</span><span>Status</span><span>Informationsweg</span></div></div>`;
    if (type === 'qms-recap') return `<div class="guide-qms-recap"><div class="qms-recap-mesh"><span></span><span></span><span></span><span></span><b>QMS</b></div><strong>GEORDNETES<br>ZUSAMMENSPIEL</strong><small>kein einzelner Ordner · kein einzelnes Zertifikat</small></div>`;
    if (type === 'history-intro') return `<div class="guide-history-intro"><div class="history-clock"><i></i><b>QM</b></div><div class="history-years"><span>1900</span><span>1930</span><span>1960</span><span>heute</span></div><strong>VOM PRODUKT ZUM SYSTEM</strong></div>`;
    if (type === 'history-end-control') return `<div class="guide-end-control"><div class="end-belt"><span class="pack ok">✓</span><span class="pack bad">×</span><span class="pack ok">✓</span></div><div class="end-gate">ENDKONTROLLE</div><div class="end-bins"><span>brauchbar</span><span class="reject">aussortiert</span></div></div>`;
    if (type === 'history-in-process') return `<div class="guide-in-process"><div class="process-belt"><span>1</span><i>◉</i><span>2</span><i>◉</i><span>3</span></div><div class="process-signal"><b>FRÜHER SICHTBAR</b><span>Stichprobe · Teilkontrolle · Beobachtung</span></div></div>`;
    if (type === 'history-prevention') return `<div class="guide-prevention-shift"><div class="late-detect"><span>FERTIG</span><b>!</b><small>spät entdecken</small></div><i>←</i><div class="early-prevent"><span>ABLAUF</span><b>✓</b><small>früh vorbeugen</small></div><strong>AUFMERKSAMKEIT WANDERT NACH VORN</strong></div>`;
    if (type === 'history-integration') return `<div class="guide-integration"><div class="integration-core">QM</div><span class="integration-node a">Prozesse</span><span class="integration-node b">Kundenbezug</span><span class="integration-node c">Entwicklung</span><span class="integration-node d">Normen</span><div class="integration-ring"></div></div>`;
    if (type === 'history-tqm') return `<div class="guide-tqm"><div class="tqm-rings"><span class="r1">PRODUKT</span><span class="r2">UNTERNEHMEN</span><span class="r3">UMFASSENDER NUTZEN</span><b>TQM</b></div><div class="tqm-benefits"><span>Kunden</span><span>Beschäftigte</span><span>Gesellschaft</span></div></div>`;
    if (type === 'history-recap') return `<div class="guide-history-recap"><div><b>1</b><span>sortieren</span></div><i>→</i><div><b>2</b><span>steuern</span></div><i>→</i><div><b>3</b><span>vorbeugen</span></div><i>→</i><div><b>4</b><span>integrieren</span></div><strong>FRÜHER · BREITER · ANSPRUCHSVOLLER</strong></div>`;
    if (type === 'evidence-intro') return `<div class="guide-evidence-intro"><div class="evidence-thought">VERMUTUNG<span>?</span></div><div class="evidence-filter">⌕</div><div class="evidence-fact">FAKTEN<span>✓</span></div><strong>NACHVOLLZIEHBAR ENTSCHEIDEN</strong></div>`;
    if (type === 'evidence-claim') return `<div class="guide-evidence-claim"><div class="claim-bubble">„Linie A macht ständig Probleme.“</div><div class="claim-questions"><span>welcher Zeitraum?</span><span>welche Menge?</span><span>welche Auffälligkeit?</span></div><b>BEHAUPTUNG ≠ BELEG</b></div>`;
    if (type === 'evidence-data') return `<div class="guide-line-data"><article><span>LINIE A</span><strong>18</strong><small>von 600 Packungen</small><i style="--bar:72%"></i></article><div class="data-vs">VS</div><article class="better"><span>LINIE B</span><strong>4</strong><small>von 600 Packungen</small><i style="--bar:22%"></i></article><b>GLEICHER ZEITRAUM · GLEICHE MENGE</b></div>`;
    if (type === 'evidence-causality') return `<div class="guide-causality"><div class="causal-observation"><span>BEOBACHTET</span><strong>mehr Auffälligkeiten</strong></div><div class="causal-not">≠</div><div class="causal-proof"><span>BEWIESEN</span><strong>eine bestimmte Ursache</strong></div><div class="cause-candidates"><b>Material?</b><b>Einstellung?</b><b>Prüfweise?</b></div></div>`;
    if (type === 'evidence-proof') return `<div class="guide-evidence-proof"><div class="proof-stack"><span><b>M</b>Messwerte</span><span><b>P</b>Prüfprotokolle</span><span><b>V</b>Versuche</span></div><div class="proof-repeat"><i>↻</i><strong>reproduzierbar?</strong><span>Ergebnis erneut erreichbar</span></div><b class="proof-result">VERTRAUEN WÄCHST</b></div>`;
    if (type === 'evidence-tradeoff') return `<div class="guide-tradeoff"><div class="trade-scale"><span class="trade-left"><b>↓</b>Auffälligkeiten</span><i></i><span class="trade-right"><b>↑</b>Durchlaufzeit</span></div><div class="trade-note">BEABSICHTIGTE UND UNBEABSICHTIGTE FOLGEN</div></div>`;
    if (type === 'evidence-recap') return `<div class="guide-evidence-recap"><div><b>?</b><span>Frage</span></div><i>→</i><div><b>▥</b><span>Daten</span></div><i>→</i><div><b>⌕</b><span>Analyse</span></div><i>→</i><div><b>✓</b><span>Entscheidung</span></div><i>→</i><div><b>↻</b><span>Wirkung</span></div></div>`;
    if (type === 'management-intro') return `<div class="guide-management-intro"><div class="management-core"><span>SYSTEM</span><strong>M</strong><small>zielorientiert führen</small></div><div class="management-ring"></div><span class="management-node a">Planung</span><span class="management-node b">Durchsetzung</span><span class="management-node c">Kontrolle</span><span class="management-node d">Steuerung</span></div>`;
    if (type === 'management-plan') return `<div class="guide-management-plan"><div class="management-target"><i></i><i></i><i></i><b>100</b><span>ZIEL</span></div><div class="management-standard"><span>LEISTUNGSSTANDARD</span><strong>klar · prüfbar · vorab</strong><div><i></i><i></i><i></i><i></i></div></div></div>`;
    if (type === 'management-execute') return `<div class="guide-management-execute"><div class="execute-plan"><span>PLAN</span><b>→</b></div><div class="execute-board"><article><b>1</b><span>Aufgabe</span><i>aktiv</i></article><article><b>2</b><span>Zuständigkeit</span><i>geklärt</i></article><article><b>3</b><span>Mittel</span><i>eingesetzt</i></article></div><strong>PLAN WIRD ARBEIT</strong></div>`;
    if (type === 'management-check') return `<div class="guide-management-check"><article class="check-soll"><span>SOLL</span><strong>100</strong><i style="--level:100%"></i></article><div class="check-gap"><b>−18</b><span>ABWEICHUNG</span></div><article class="check-ist"><span>IST</span><strong>82</strong><i style="--level:82%"></i></article><div class="check-result">ZIELERREICHUNG TRANSPARENT</div></div>`;
    if (type === 'management-steer') return `<div class="guide-management-steer"><div class="steer-route"><i></i><i></i><i class="off"></i><i></i><b>ZIEL</b></div><div class="steer-console"><span>PRIORITÄT</span><span>ENTSCHEIDUNG</span><span>RESSOURCEN</span><strong>KURS ANPASSEN ↗</strong></div></div>`;
    if (type === 'management-resources') return `<div class="guide-management-resources"><div class="resource-stack"><span><b>M</b>Menschen</span><span><b>Z</b>Zeit</span><span><b>€</b>Mittel</span></div><div class="resource-flow">→</div><div class="resource-goal"><i></i><strong>GESAMTZIEL</strong><span>nicht nur Bereichsvorteil</span></div></div>`;
    if (type === 'management-recap') return `<div class="guide-management-recap"><div><b>1</b><span>Planen</span></div><i>→</i><div><b>2</b><span>Durchsetzen</span></div><i>→</i><div><b>3</b><span>Kontrollieren</span></div><i>→</i><div><b>4</b><span>Steuern</span></div><strong>ZIELORIENTIERTES GESAMTSYSTEM</strong></div>`;
    if (type === 'customer-hidden-intro') return `<div class="guide-customer-hidden"><div class="customer-person">K</div><div class="customer-bubble explicit"><span>GENANNT</span><strong>„500 Kartons“</strong></div><div class="customer-bubble presumed"><span>VORAUSGESETZT</span><strong>„selbstverständlich …“</strong></div><b>ZWEI ANFORDERUNGSGRUPPEN</b></div>`;
    if (type === 'customer-explicit') return `<div class="guide-customer-explicit"><div class="explicit-sheet"><span>VEREINBARUNG</span><div><b>Menge</b><i>500</i></div><div><b>Größe</b><i>20–40 mm</i></div><div><b>Termin</b><i>Freitag</i></div><strong>MESSBAR</strong></div><div class="explicit-stamp">✓<span>BENANNT</span></div></div>`;
    if (type === 'customer-order') return `<div class="guide-customer-order"><article><span>MENGE</span><strong>500</strong><small>Kartons</small></article><article><span>SCHNITT</span><strong>20–40</strong><small>Millimeter</small></article><article><span>TERMIN</span><strong>FR</strong><small>Lieferung</small></article><b>SICHTBAR · ÜBERPRÜFBAR</b></div>`;
    if (type === 'customer-presumed') return `<div class="guide-customer-presumed"><div class="presumed-product"><span>CARAT</span><strong>TK-BROKKOLI</strong><small>bestellte Ware</small></div><div class="presumed-layer a">gebrauchstauglich</div><div class="presumed-layer b">verlässliche Beschaffenheit</div><div class="presumed-layer c">selbstverständlich erwartet</div></div>`;
    if (type === 'customer-service') return `<div class="guide-customer-service"><div class="service-center">SERVICE</div><span class="service-signal a"><b>☺</b>freundlich</span><span class="service-signal b"><b>☎</b>erreichbar</span><span class="service-signal c"><b>↯</b>schnell</span><span class="service-signal d"><b>✓</b>kulant</span><strong>OFT NICHT IN DER BESTELLZEILE</strong></div>`;
    if (type === 'customer-discovery') return `<div class="guide-customer-discovery"><div class="discovery-radar"><i></i><i></i><i></i><b>⌕</b></div><div class="discovery-signals"><span>Gespräch</span><span>Rückmeldung</span><span>Gebrauch</span></div><strong>GENAUER HINHÖREN</strong></div>`;
    if (type === 'customer-recap') return `<div class="guide-customer-recap"><article><span>AUSDRÜCKLICH</span><b>benannt</b><small>vereinbart</small></article><i>+</i><article><span>VORAUSGESETZT</span><b>unausgesprochen</b><small>selbstverständlich</small></article><strong>BEIDES VERSTEHEN</strong></div>`;
    if (type === 'growth-intro') return `<div class="guide-growth-intro"><div class="growth-small-team"><b>I</b><span>M</span><span>M</span><span>M</span><small>direkter Überblick</small></div><div class="growth-arrow">↗</div><div class="growth-large-team"><b>I</b><span></span><span></span><span></span><span></span><span></span><span></span><small>mehr Abstimmung</small></div><strong>ERFOLG VERÄNDERT DIE ORGANISATION</strong></div>`;
    if (type === 'growth-head-system') return `<div class="guide-growth-head"><div class="head-owner"><span>INHABER</span><strong>ALLES<br>IM KOPF</strong><i></i></div><div class="head-knowledge"><span>Aufträge</span><span>Zuständigkeiten</span><span>Abläufe</span><span>Mittel</span></div><b>DIREKTE ABSPRACHE</b></div>`;
    if (type === 'growth-orders') return `<div class="guide-growth-orders"><div class="order-bars"><span style="--h:34%"><b>3</b></span><span style="--h:53%"><b>7</b></span><span style="--h:76%"><b>14</b></span><span style="--h:96%"><b>25</b></span></div><div class="growth-demand"><strong>MEHR</strong><span>Kunden</span><span>Aufträge</span><span>Übergaben</span><span>Mitarbeitende</span></div><b>ABSTIMMUNGSBEDARF STEIGT</b></div>`;
    if (type === 'growth-communication') return `<div class="guide-growth-communication"><div class="communication-owner">I</div><span class="communication-person a">A</span><span class="communication-person b">B</span><span class="communication-person c">C</span><span class="communication-person d">D</span><i class="communication-line l1"></i><i class="communication-line l2"></i><i class="communication-line l3"></i><i class="communication-line l4"></i><div class="communication-break">×</div><strong>ZUSAMMENHÄNGE NICHT MEHR SICHTBAR</strong></div>`;
    if (type === 'growth-consequences') return `<div class="guide-growth-consequences"><article><b>≠</b><span>unterschiedliche Ausführung</span></article><i>→</i><article><b>!</b><span>Fehler beim Kunden</span></article><i>→</i><article><b>☎</b><span>Beschwerden</span></article><strong>DAS INFORMELLE SYSTEM TRÄGT NICHT MEHR</strong></div>`;
    if (type === 'growth-transparency') return `<div class="guide-growth-transparency"><div class="transparency-head"><span>KOPF</span><b>?</b><small>nur persönlich verfügbar</small></div><i>→</i><div class="transparency-system"><span>ORDNUNGSSYSTEM</span><div><b>A</b>Ablauf</div><div><b>Z</b>Zuständigkeit</div><div><b>V</b>Verantwortung</div><strong>GEMEINSAM SICHTBAR</strong></div></div>`;
    if (type === 'growth-recap') return `<div class="guide-growth-recap"><article><b>1</b><span>kleines Team</span><small>direkte Absprachen</small></article><i>→</i><article><b>2</b><span>Wachstum</span><small>Überblick bricht</small></article><i>→</i><article><b>3</b><span>QMS</span><small>Regeln werden sichtbar</small></article><strong>WISSEN UNABHÄNGIG VON EINZELNEN KÖPFEN</strong></div>`;
    if (type === 'elements-intro') return `<div class="guide-elements-intro"><div class="elements-core">QMS</div><span class="element-question q1">Was?</span><span class="element-question q2">Wer?</span><span class="element-question q3">Wie?</span><span class="element-question q4">Wann?</span><span class="element-question q5">Wo?</span><span class="element-question q6">Womit?</span><div class="elements-ring"></div></div>`;
    if (type === 'elements-frame') return `<div class="guide-elements-frame"><div class="frame-direction">RICHTUNG STEHT FEST</div><div class="frame-columns"><article><b>A</b><span>Aufbau</span><small>Zuständigkeit</small></article><article><b>P</b><span>Ablauf</span><small>Durchführung</small></article><article><b>M</b><span>Mittel</span><small>Ausstattung</small></article></div><div class="frame-base">TRAGFÄHIGER ORGANISATORISCHER RAHMEN</div></div>`;
    if (type === 'elements-build') return `<div class="guide-elements-build"><div class="build-top"><b>L</b><span>Leitung</span></div><i></i><div class="build-row"><span><b>E</b>Einkauf</span><span><b>P</b>Produktion</span><span><b>Q</b>Qualität</span></div><div class="build-questions"><strong>WER?</strong><strong>BEFUGNIS?</strong><strong>WO?</strong></div></div>`;
    if (type === 'elements-flow') return `<div class="guide-elements-flow"><div class="element-flow-track"><article><b>1</b><span>Was?</span></article><i>→</i><article><b>2</b><span>Wie?</span></article><i>→</i><article><b>3</b><span>Wann?</span></article></div><div class="flow-interlock"><span></span><span></span><b>PROZESSSCHRITTE GREIFEN INEINANDER</b></div></div>`;
    if (type === 'elements-means') return `<div class="guide-elements-means"><article><b>M</b><span>Mitarbeitende</span></article><article><b>A</b><span>Anlagen</span></article><article><b>W</b><span>Werkzeuge</span></article><article><b>T</b><span>Techniken</span></article><article><b>V</b><span>Verfahren</span></article><article><b>↻</b><span>Methoden</span></article><strong>WOMIT WIRD DIE AUFGABE ERFÜLLT?</strong></div>`;
    if (type === 'elements-carat') return `<div class="guide-elements-carat"><div class="carat-question-grid"><span><b>WAS</b>Temperatur prüfen</span><span><b>WER</b>Wareneingang</span><span><b>WIE</b>definiert messen</span><span><b>WANN</b>jede Lieferung</span><span><b>WO</b>Messort</span><span><b>WOMIT</b>Thermometer</span></div><strong>CARAT · WARENANNAHME</strong></div>`;
    if (type === 'elements-recap') return `<div class="guide-elements-recap"><div><b>WAS</b></div><i>·</i><div><b>WER</b></div><i>·</i><div><b>WIE</b></div><i>·</i><div><b>WANN</b></div><i>·</i><div><b>WO</b></div><i>·</i><div><b>WOMIT</b></div><strong>NUTZBARES ORDNUNGSSYSTEM</strong></div>`;
    if (type === 'levels-intro') return `<div class="guide-levels-intro"><div class="levels-ring value"><span>WERTSCHÖPFUNG</span></div><div class="levels-ring process"><span>PROZESS</span></div><div class="levels-ring product"><strong>PRODUKT</strong></div><b>DREI BLICKWEITEN</b></div>`;
    if (type === 'levels-product') return `<div class="guide-levels-product"><div class="level-product-box"><span>ERGEBNIS</span><strong>TK-MANGO</strong><small>fertige Ware</small></div><div class="product-lens">⌕</div><div class="product-checklist"><span>Vorgabe</span><span>Prüfung</span><span>Vergleich</span><strong>PRODUKT IM MITTELPUNKT</strong></div></div>`;
    if (type === 'levels-carat-product') return `<div class="guide-levels-carat-product"><article><span>PACKUNGSGEWICHT</span><strong>2,5</strong><small>kg · Sollwert</small><i style="--value:86%"></i></article><article><span>WÜRFELGRÖSSE</span><strong>20</strong><small>mm · Vorgabe</small><i style="--value:67%"></i></article><b>FERTIGE WARE BEURTEILEN</b></div>`;
    if (type === 'levels-process') return `<div class="guide-levels-process"><div class="level-process-route"><span>Material</span><i>→</i><span>Schneiden</span><i>→</i><span>Abfüllen</span><i>→</i><span>Ergebnis</span></div><div class="process-shield">✓</div><div class="process-influences"><b>EINFLÜSSE FRÜH BEHERRSCHEN</b><span>Planung</span><span>Arbeitsmittel</span><span>Durchführung</span></div></div>`;
    if (type === 'levels-prevention') return `<div class="guide-levels-prevention"><div class="prevention-stage"><span><b>1</b>Schneiden<i>✓</i></span><span><b>2</b>Abfüllen<i>✓</i></span><span><b>3</b>Übergabe<i>✓</i></span></div><i>→</i><div class="prevention-result"><strong>MANGO</strong><span>gewünschte Merkmale</span></div><b>PROZESS ERZEUGT QUALITÄT ZUVERLÄSSIG</b></div>`;
    if (type === 'levels-value-chain') return `<div class="guide-levels-value"><div class="value-chain-track"><span><b>L</b>Lieferant</span><i>→</i><span><b>H</b>Herstellung</span><i>→</i><span><b>A</b>Auslieferung</span><i>→</i><span><b>S</b>Service</span></div><div class="value-support"><span>Qualifizierung</span><span>Unterstützung</span><span>Partnerwahl</span></div><strong>GESAMTE WERTSCHÖPFUNGSKETTE</strong></div>`;
    if (type === 'levels-recap') return `<div class="guide-levels-recap"><article><b>1</b><span>Kontrolle</span><small>Produkt</small></article><i>→</i><article><b>2</b><span>Sicherung</span><small>Herstellung</small></article><i>→</i><article><b>3</b><span>QM</span><small>Wertschöpfung</small></article><strong>DIE BLICKWEITE WÄCHST</strong></div>`;
    if (type === 'relations-intro') return `<div class="guide-relations-intro"><div class="relation-org supplier"><span>LIEFERANT</span><strong>L</strong></div><div class="relation-bridge"><i></i><b>↔</b><span>BEZIEHUNG</span></div><div class="relation-org carat"><span>CARAT</span><strong>C</strong></div><small>LEISTUNG ENTSTEHT NICHT ISOLIERT</small></div>`;
    if (type === 'relations-seven') return `<div class="guide-relations-seven"><span><b>1</b>Kunde</span><span><b>2</b>Führung</span><span><b>3</b>Personen</span><span><b>4</b>Prozesse</span><span><b>5</b>Verbesserung</span><span><b>6</b>Fakten</span><span class="active"><b>7</b>Beziehungen</span><strong>SIEBEN GRUNDSÄTZE · EIN RAHMEN</strong></div>`;
    if (type === 'relations-influence') return `<div class="guide-relations-influence"><div class="influence-party"><span>INTERESSIERTE PARTEI</span><b>L</b><small>Lieferant</small></div><i>→</i><div class="influence-meter"><span>EINFLUSS AUF LEISTUNG</span><div><b></b></div><small>Verfügbarkeit · Information · Stabilität</small></div><i>→</i><div class="influence-org">CARAT</div></div>`;
    if (type === 'relations-carat') return `<div class="guide-relations-carat"><div class="relations-inputs"><span><b>R</b>Rohware</span><span><b>T</b>Termin</span><span><b>I</b>Information</span></div><div class="relations-gate">→</div><div class="relations-carat-core"><strong>CARAT</strong><span>eigene Leistung</span><i>↻</i></div><b>WIRKUNG SETZT SICH FORT</b></div>`;
    if (type === 'relations-manage') return `<div class="guide-relations-manage"><article><b>1</b><span>Erwartungen klären</span></article><article><b>2</b><span>Information teilen</span></article><article><b>3</b><span>Leistung bewerten</span></article><article><b>4</b><span>gemeinsam entwickeln</span></article><strong>BEZIEHUNG BEWUSST LENKEN</strong></div>`;
    if (type === 'relations-network') return `<div class="guide-relations-network"><div class="network-center">CARAT</div><span class="network-partner a">Lieferant A</span><span class="network-partner b">Partner B</span><span class="network-partner c">Dienst C</span><span class="network-partner d">Kunde D</span><div class="network-ring"></div><strong>LANGFRISTIGE WIRKUNG STATT EINZELPREIS</strong></div>`;
    if (type === 'relations-recap') return `<div class="guide-relations-recap"><div class="boundary-left"><span>AUSSEN</span><strong>Partner</strong></div><div class="boundary-link"><i></i><b>↔</b></div><div class="boundary-right"><span>INNEN</span><strong>Organisation</strong></div><small>ERKENNEN · VERSTEHEN · LENKEN</small></div>`;
    if (type === 'roi-intro') return `<div class="guide-roi-intro"><div class="roi-invest"><span>AUFWAND</span><strong>€</strong><small>Einführung</small></div><div class="roi-balance">↔</div><div class="roi-growth"><span>WIRKUNG</span><div><i></i><i></i><i></i><i></i></div><small>Markt · Ergebnis</small></div><b>WANN RECHNET ES SICH?</b></div>`;
    if (type === 'roi-timeline') return `<div class="guide-roi-timeline"><div class="roi-zero"><span>START</span><b>−</b><small>Einführungsaufwand</small></div><div class="roi-line"><i></i><i></i><i></i><i></i><i></i><i></i><strong>ZEIT →</strong></div><div class="roi-benefit"><span>NUTZEN</span><b>+</b><small>wächst schrittweise</small></div></div>`;
    if (type === 'roi-market-chain') return `<div class="guide-roi-market"><article><b>☺</b><span>Kundenzufriedenheit</span></article><i>→</i><article><b>◆</b><span>Marktposition</span></article><i>→</i><article><b>↗</b><span>Marktanteil</span></article><strong>MÖGLICHE MARKTWIRKUNG</strong></div>`;
    if (type === 'roi-result') return `<div class="guide-roi-result"><div class="result-streams"><span>Marktwirkung</span><span>Nutzenbeiträge</span><span>Zeiteffekt</span></div><i>→</i><div class="result-core"><span>BETRIEBSERGEBNIS</span><strong>+</strong><small>tatsächlicher Beitrag</small></div><b>WIRKUNGEN ZUSAMMENFÜHREN</b></div>`;
    if (type === 'roi-formula') return `<div class="guide-roi-formula"><div class="formula-name">AMORTISATIONSDAUER</div><div class="formula-fraction"><span>Einführungskosten</span><i></i><span>jährlicher Ergebnisbeitrag</span></div><div class="formula-equals">= ZEIT</div><strong>AUFWAND RECHNERISCH ZURÜCKVERDIENT</strong></div>`;
    if (type === 'roi-example') return `<div class="guide-roi-example"><div class="example-cost"><span>KOSTEN</span><strong>18.000 €</strong></div><div class="example-divide">÷</div><div class="example-benefit"><span>PRO JAHR</span><strong>27.000 €</strong></div><div class="example-equals">=</div><div class="example-months"><strong>8</strong><span>MONATE</span></div><small>NEU ENTWICKELTES RECHENBEISPIEL</small></div>`;
    if (type === 'roi-recap') return `<div class="guide-roi-recap"><article><b>1</b><span>Marktwirkung</span><small>beobachten</small></article><article><b>2</b><span>Ergebnisbeitrag</span><small>messen</small></article><article><b>3</b><span>Zeitraum</span><small>nachweisen</small></article><strong>MÖGLICH · NICHT GARANTIERT</strong></div>`;
    if (type === 'proc-intro') return `<div class="guide-proc-intro"><article><span>EINGABE</span><b>E</b><small>materiell · immateriell</small></article><i>→</i><div class="proc-transform"><span>AKTIVITÄTEN</span><strong>↻</strong><small>mit geeigneten Mitteln</small></div><i>→</i><article class="result"><span>ERGEBNIS</span><b>✓</b><small>spezifiziert</small></article></div>`;
    if (type === 'proc-inputs') return `<div class="guide-proc-inputs"><article><span>MATERIELL</span><b>▦</b><strong>Rohstoff</strong><small>Halbfertigteil</small></article><article><span>IMMATERIELL</span><b>§</b><strong>Auftrag</strong><small>Anweisung · Spezifikation</small></article><div class="proc-input-gate">EINGABEN <i>→</i></div></div>`;
    if (type === 'proc-means') return `<div class="guide-proc-means"><div class="means-input"><span>EINGABEN</span><strong>werden umgewandelt</strong></div><i>→</i><div class="means-core"><span>PROZESS</span><b>↻</b></div><div class="means-resources"><span><b>A</b>Anlagen</span><span><b>W</b>Werkzeuge</span><span><b>M</b>Methoden</span><span><b>F</b>Fähigkeiten</span><strong>MITTEL ERMÖGLICHEN DIE UMWANDLUNG</strong></div></div>`;
    if (type === 'proc-flow') return `<div class="guide-proc-flow"><section><span>NACHEINANDER</span><div><b>1</b><i>→</i><b>2</b><i>→</i><b>3</b></div></section><section><span>PARALLEL</span><div class="parallel"><b>A</b><i></i><b>B</b><i></i><b>C</b></div></section><strong>LOGISCH AUF EIN ERGEBNIS AUSGERICHTET</strong></div>`;
    if (type === 'proc-results') return `<div class="guide-proc-results"><article><b>▣</b><span>PRODUKT</span><small>materiell</small></article><article><b>↗</b><span>DIENSTLEISTUNG</span><small>erbracht</small></article><article><b>i</b><span>INFORMATION</span><small>Daten · Auskunft</small></article><strong>JEDER PROZESS HAT EIN ERGEBNIS</strong></div>`;
    if (type === 'proc-carat') return `<div class="guide-proc-carat"><div class="carat-proc-input"><span>EINGABEN</span><b>TK-Brokkoli</b><b>Auftrag</b><b>Spezifikation</b></div><i>→</i><div class="carat-proc-work"><span>MITTEL + TÄTIGKEITEN</span><strong>portionieren<br>prüfen<br>verpacken</strong><small>Personal · Waage · Anlage · Methode</small></div><i>→</i><div class="carat-proc-result"><span>ERGEBNIS</span><b>✓</b><strong>fertige Packung</strong></div></div>`;
    if (type === 'proc-recap') return `<div class="guide-proc-recap"><span><b>E</b>Eingabe</span><i>+</i><span><b>M</b>Mittel</span><i>+</i><span><b>A</b>Aktivitäten</span><i>→</i><span class="active"><b>✓</b>Ergebnis</span><strong>VOLLSTÄNDIGER UMWANDLUNGSZUSAMMENHANG</strong></div>`;
    if (type === 'pm-intro') return `<div class="guide-pm-intro"><div class="pm-core"><span>PROZESS</span><strong>P</strong><small>systematisch gelenkt</small></div><div class="pm-orbit"></div><span class="pm-node n1">festlegen</span><span class="pm-node n2">messen</span><span class="pm-node n3">bewerten</span><span class="pm-node n4">verbessern</span></div>`;
    if (type === 'pm-cycle') return `<div class="guide-pm-cycle"><article><b>1</b><span>festlegen</span></article><i>→</i><article><b>2</b><span>messbar machen</span></article><i>→</i><article><b>3</b><span>umsetzen</span></article><i>→</i><article><b>4</b><span>bewerten</span></article><i>→</i><article><b>5</b><span>verbessern</span></article><strong>DAUERHAFT · NICHT EINMALIG</strong></div>`;
    if (type === 'pm-alignment') return `<div class="guide-pm-alignment"><article><span>KUNDE</span><b>☺</b><small>Bedürfnisse</small></article><i>→</i><div class="alignment-process"><span>PROZESS</span><strong>↔</strong><small>ausgerichtet</small></div><i>←</i><article><span>UNTERNEHMEN</span><b>◎</b><small>Ziele</small></article><strong>BEIDE RICHTUNGEN VERBINDEN</strong></div>`;
    if (type === 'pm-architecture') return `<div class="guide-pm-architecture"><article><span>PROZESS A</span><b>Eingabe → Ergebnis</b></article><i>→</i><article><span>PROZESS B</span><b>Eingabe → Ergebnis</b></article><i>→</i><article><span>PROZESS C</span><b>Eingabe → Ergebnis</b></article><strong>ERGEBNIS WIRD ZUR NÄCHSTEN EINGABE</strong></div>`;
    if (type === 'pm-control') return `<div class="guide-pm-control"><article><b>M</b><span>Methode</span><small>Durchführung</small></article><article><b>K</b><span>Kennzahl</span><small>Leistung</small></article><article><b>R</b><span>Ressourcen</span><small>Mittel</small></article><article><b>V</b><span>Verantwortung</span><small>Befugnis</small></article><div class="pm-kpi"><span>LEISTUNGSINDIKATOR</span><i><b></b></i><strong>beobachtbar</strong></div></div>`;
    if (type === 'pm-risk') return `<div class="guide-pm-risk"><div class="pm-risk-card"><span>RISIKO</span><b>!</b><small>mögliche Störung</small></div><div class="pm-chance-card"><span>CHANCE</span><b>↗</b><small>mögliche Wirkung</small></div><i>↓</i><div class="pm-evaluate"><span>BEWERTEN</span><strong>Änderung beherrschen</strong><strong>Verbesserung umsetzen</strong></div></div>`;
    if (type === 'pm-document') return `<div class="guide-pm-document"><div class="pm-doc"><span>PROZESSBESCHREIBUNG</span><i></i><i></i><i></i><section><b>E</b>Eingaben</section><section><b>K</b>Kennzahlen</section><section><b>V</b>Verantwortung</section><strong>FESTLEGUNGEN VERFÜGBAR</strong></div><div class="pm-doc-stamp">✓<span>NACHVOLLZIEHBAR</span></div></div>`;
    return `<div class="guide-recap-card"><span class="recap-small">MERKSATZ</span><strong>Qualität ist<br>erfüllte Anforderung.</strong><div class="recap-question">Welche Anforderung gilt – und woran erkennst du ihre Erfüllung?</div></div>`;
  }

  function videoStageMarkup(index, guide = currentVideoGuide()) {
    const scene = guide.scenes[index] || guide.scenes[0];
    return `<div class="video-scene-copy"><div class="video-scene-kicker">${esc(scene.kicker)}</div><h2>${esc(scene.title)}</h2><p>${esc(scene.caption)}</p></div><div class="video-scene-visual">${videoVisualMarkup(scene.visual)}</div><div class="video-caption"><span>Untertitel</span><p>${esc(scene.narration)}</p></div>`;
  }

  function renderVideoGuides() {
    const guide = currentVideoGuide();
    state.videoGuideId = guide.id;
    const completed = Boolean(store.videoGuideProgress?.[guide.id]?.completed);
    const completedCount = PUBLISHED_VIDEO_GUIDES.filter(item => store.videoGuideProgress?.[item.id]?.completed).length;
    const guideIndex = PUBLISHED_VIDEO_GUIDES.findIndex(item => item.id === guide.id);
    const nextGuide = PUBLISHED_VIDEO_GUIDES[guideIndex + 1];
    const station = videoStationForGuide(guide);
    const videoSeriesMarkup = ALL_VIDEO_STATIONS.map(videoStation => {
      const guides = videoStation.videoNumbers.map(videoGuideByNumber).filter(Boolean);
      return `<section class="video-series-group ${videoStation.supplement ? 'supplement' : ''}">
      <div class="video-series-group-head"><div><div class="eyebrow">${esc(videoStation.section)}</div><h3>${esc(videoStation.title)}</h3></div><span>${guides.filter(item => store.videoGuideProgress?.[item.id]?.completed).length}/${guides.length} angesehen</span></div>
      <div class="video-series-grid">${guides.map(item => {
        const watched = Boolean(store.videoGuideProgress?.[item.id]?.completed);
        return `<button class="video-series-card ${item.id === guide.id ? 'active' : ''}" type="button" data-action="select-video-guide" data-video-id="${item.id}" aria-pressed="${item.id === guide.id}"><span class="video-list-number">${String(item.pathNumber || item.number).padStart(2,'0')}</span><span class="video-list-copy"><small>${esc(item.section)} · ${formatVideoTime(item.duration)}</small><strong>${esc(item.title)}</strong><span>${esc(item.summary)}</span></span><b class="video-list-status">${watched ? '✓ angesehen' : item.id === guide.id ? 'ausgewählt' : 'öffnen'}</b></button>`;
      }).join('')}</div>
    </section>`;
    }).join('');
    state.videoGuideScene = videoSceneIndexAt(state.videoGuideElapsed, guide);
    app.innerHTML = layout(`<div class="video-guide-page">
      <section class="video-guide-hero">
        <div><div class="eyebrow">Optionale Gesamtübersicht · in zwei Lernpfade eingegliedert</div><h1>Visuelle Ergänzungen zu Kapitel 2 und 3</h1><p class="lead">17 Kurzvideos ergänzen „Qualität verstehen“, zehn weitere „Prozesse & PDCA“. Texte, Fragen und Aufgaben bleiben der Hauptlernweg.</p></div>
        <div class="video-guide-status"><strong>${PUBLISHED_VIDEO_GUIDES.length}</strong><span>geprüfte Kurzvideos</span><small>${completedCount} angesehen · ${ALL_VIDEO_STATIONS.length} Lernpfadstationen</small></div>
      </section>
      <section class="video-series-panel">
        <div class="video-series-head"><div><div class="eyebrow">Lernpfad 1 und 2</div><h2>Kapitelstation wählen</h2><p>Die Übersicht folgt den Quellenabschnitten 2.1 bis 3.4. Jedes Video bleibt zusätzlich direkt an seiner Lernpfadstation erreichbar.</p></div><span>${PUBLISHED_VIDEO_GUIDES.length} Videos</span></div>
        <div class="video-series-groups">${videoSeriesMarkup}</div>
      </section>
      <section class="video-guide-chapter">
        <div class="video-chapter-head"><div><span>${esc(guide.chapter)}</span><h2>${esc(guide.section)}: ${esc(guide.title)}</h2><p>Spieldauer ${formatVideoTime(guide.duration)} · Untertitel · optionale deutsche Gerätestimme${completed ? ' · bereits angesehen' : ''}</p></div><div class="video-duration">${formatVideoTime(guide.duration)}</div></div>
        ${station ? `<div class="video-path-placement"><span>Eingegliedert in</span><strong>${esc(station.section)} · ${esc(station.title)}</strong><small>${esc(station.description)}</small></div>` : ''}
        <div class="video-player-shell">
          <div class="video-stage scene-${guide.scenes[state.videoGuideScene].visual}" id="videoGuideStage" aria-live="polite">${videoStageMarkup(state.videoGuideScene, guide)}</div>
          <div class="video-timeline"><input id="videoGuideSeek" type="range" min="0" max="${guide.duration}" step="0.1" value="${state.videoGuideElapsed}" aria-label="Videoposition"><div class="video-time"><span id="videoCurrentTime">${formatVideoTime(state.videoGuideElapsed)}</span><span>${formatVideoTime(guide.duration)}</span></div></div>
          <div class="video-controls">
            <button class="primary-btn" id="videoPlayButton" data-action="video-play">▶ Abspielen</button>
            <button class="primary-btn" id="videoPauseButton" data-action="video-pause" hidden>Ⅱ Pause</button>
            <button class="secondary-btn" data-action="video-restart">↺ Von vorn</button>
            <button class="secondary-btn ${state.videoGuideVoice ? 'active' : ''}" id="videoVoiceButton" data-action="video-voice" aria-pressed="${state.videoGuideVoice}">${state.videoGuideVoice ? '🔊 Stimme an' : '🔇 Stimme aus'}</button>
            ${nextGuide ? `<button class="secondary-btn" data-action="video-next-guide">Nächstes Kurzvideo →</button>` : ''}
            ${state.videoGuideReturnView === 'learningPath' ? `<button class="secondary-btn" data-action="video-return">← Zur Lernpfadstation</button>` : ''}
            <span class="video-scene-counter" id="videoSceneCounter">Szene ${state.videoGuideScene + 1} von ${guide.scenes.length}</span>
          </div>
        </div>
        <div class="video-source-note"><strong>Fachliche Grundlage:</strong> ${esc(guide.source)}. ${esc(guide.sourceNote)}</div>
        <div class="video-covered-topics"><strong>In diesem Kurzvideo verbindlich abgegrenzt:</strong><div>${(guide.topics || []).map(topic=>`<span>${esc(topic)}</span>`).join('')}</div></div>
        <details class="video-transcript"><summary>Sprechertext vollständig anzeigen</summary>${guide.scenes.map((scene,index)=>`<div><b>${index+1}. ${esc(scene.title)}</b><p>${esc(scene.narration)}</p></div>`).join('')}</details>
      </section>
      <section class="video-next-note"><div><div class="eyebrow">Visuelle Ergänzung statt zweitem Unterrichtsweg</div><h2>27 Videos decken Kapitel 2 und 3 vollständig ab</h2><p>Jeder eigenständige Themenkern besitzt genau einen Platz. Im Lernpfad öffnest du die Videos direkt an der passenden Station und kehrst anschließend dorthin zurück.</p></div><button class="secondary-btn" data-action="learning-path">Zum Lernpfad</button></section>
      <section class="video-coverage-complete">
        <div class="coverage-complete-seal">✓</div>
        <div><div class="eyebrow">TÜV Modul 1 · Kapitel 2 und 3</div><h2>Vollständig zugeordnet und auf Wiederholungen geprüft</h2><p>Kapitel 2 bleibt mit 17 Videos vollständig. Kapitel 3 ergänzt zehn einzeln abgegrenzte Themen; die höchste Textüberschneidung innerhalb des neuen Kapitels liegt bei 11,3 Prozent.</p></div>
        <span>17 + 10 Videos</span>
      </section>
    </div>`);
    updateVideoGuideControls();
  }

  function speakVideoScene(index) {
    if (!state.videoGuideVoice || !globalThis.speechSynthesis || typeof globalThis.SpeechSynthesisUtterance !== 'function') return;
    globalThis.speechSynthesis.cancel();
    const scene = currentVideoGuide().scenes[index];
    if (!scene) return;
    const utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = 'de-DE';
    utterance.rate = .96;
    utterance.pitch = 1;
    const voices = globalThis.speechSynthesis.getVoices?.() || [];
    const german = voices.find(voice => /^de(-|_)/i.test(voice.lang || ''));
    if (german) utterance.voice = german;
    globalThis.speechSynthesis.speak(utterance);
  }

  function updateVideoGuideControls() {
    const guide = currentVideoGuide();
    const seek = document.getElementById('videoGuideSeek');
    if (seek) seek.value = String(state.videoGuideElapsed);
    const time = document.getElementById('videoCurrentTime');
    if (time) time.textContent = formatVideoTime(state.videoGuideElapsed);
    const play = document.getElementById('videoPlayButton');
    const pause = document.getElementById('videoPauseButton');
    if (play) play.hidden = state.videoGuidePlaying;
    if (pause) pause.hidden = !state.videoGuidePlaying;
    const counter = document.getElementById('videoSceneCounter');
    if (counter) counter.textContent = `Szene ${state.videoGuideScene + 1} von ${guide.scenes.length}`;
  }

  function showVideoScene(index, speak = false) {
    const guide = currentVideoGuide();
    state.videoGuideScene = Math.max(0, Math.min(guide.scenes.length - 1, Number(index) || 0));
    const stage = document.getElementById('videoGuideStage');
    if (stage) {
      stage.className = `video-stage scene-${guide.scenes[state.videoGuideScene].visual}`;
      stage.innerHTML = videoStageMarkup(state.videoGuideScene, guide);
    }
    updateVideoGuideControls();
    if (speak) speakVideoScene(state.videoGuideScene);
  }

  function pauseVideoGuide(cancelVoice = true) {
    clearInterval(videoGuideHandle);
    videoGuideHandle = null;
    state.videoGuidePlaying = false;
    if (cancelVoice && globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
    updateVideoGuideControls();
  }

  function completeVideoGuide() {
    const guide = currentVideoGuide();
    pauseVideoGuide(false);
    state.videoGuideElapsed = guide.duration;
    state.videoGuideScene = guide.scenes.length - 1;
    store.videoGuideProgress[guide.id] = {completed:true,completedAt:new Date().toISOString(),seconds:guide.duration};
    saveStore();
    showVideoScene(state.videoGuideScene, false);
    toast(`${guide.section} vollständig angesehen.`);
  }

  function startVideoGuide() {
    const guide = currentVideoGuide();
    if (state.videoGuideElapsed >= guide.duration) {
      state.videoGuideElapsed = 0;
      showVideoScene(0, false);
    }
    clearInterval(videoGuideHandle);
    state.videoGuidePlaying = true;
    state.videoGuideLastTick = performance.now();
    updateVideoGuideControls();
    speakVideoScene(state.videoGuideScene);
    videoGuideHandle = setInterval(() => {
      const now = performance.now();
      const delta = Math.max(0, Math.min(1, (now - state.videoGuideLastTick) / 1000));
      state.videoGuideLastTick = now;
      state.videoGuideElapsed = Math.min(guide.duration, state.videoGuideElapsed + delta);
      const nextScene = videoSceneIndexAt(state.videoGuideElapsed, guide);
      if (nextScene !== state.videoGuideScene) showVideoScene(nextScene, true);
      else updateVideoGuideControls();
      if (state.videoGuideElapsed >= guide.duration) completeVideoGuide();
    }, 200);
  }

  function seekVideoGuide(seconds) {
    const guide = currentVideoGuide();
    state.videoGuideElapsed = Math.max(0, Math.min(guide.duration, Number(seconds) || 0));
    const nextScene = videoSceneIndexAt(state.videoGuideElapsed, guide);
    showVideoScene(nextScene, state.videoGuidePlaying);
    if (state.videoGuideElapsed >= guide.duration && state.videoGuidePlaying) completeVideoGuide();
  }

  function layout(content) {
    return `<div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <button class="brand" type="button" data-action="home" aria-label="Startseite">
            <div class="brand-mark"><span>Q</span></div>
            <div class="brand-copy">
              <div class="brand-title">Qualitätsmanager Lernplattform</div>
            </div>
          </button>
          <nav class="main-nav" aria-label="Hauptnavigation">
            <button class="nav-btn ${state.view === 'home' ? 'active' : ''}" data-action="home">Start</button>
            <button class="nav-btn ${state.view === 'database' || state.view === 'catalog' || state.view === 'statistics' ? 'active' : ''}" data-action="statistics">Statistik</button>
            <button class="nav-btn top-nav-action quick-menu-trigger" type="button" data-action="quick-menu" aria-haspopup="dialog" aria-controls="quickMenu"><span class="quick-menu-trigger-icon">☰</span><span class="quick-label-wide">Alle Bereiche</span><span class="quick-label-short">Bereiche</span></button>
            <button class="nav-btn top-nav-action install-btn" id="installBtn" data-action="install-help" title="Als App installieren" aria-label="Als App installieren"><b aria-hidden="true">⇩</b><span>App</span></button>
          </nav>
          <div class="top-actions">
            <button class="icon-btn account-button" id="accountBtn" data-action="account" title="Persönliches Konto" aria-label="Persönliches Konto"><span aria-hidden="true">@</span></button>
            <button class="icon-btn ${state.view === 'settings' ? 'active' : ''}" data-action="settings" title="Einstellungen" aria-label="Einstellungen">⚙</button>
            <button class="icon-btn" data-action="theme" title="${store.theme === 'dark' ? 'Edelgrün einschalten' : 'Nachtmodus einschalten'}" aria-label="${store.theme === 'dark' ? 'Edelgrün einschalten' : 'Nachtmodus einschalten'}">${store.theme === 'dark' ? '☀' : '🌙'}</button>
          </div>
        </div>
      </header>
      ${quickMenuMarkup()}
      ${installHelpMarkup()}
      <main>${content}</main>
      <footer class="app-legal-footer" aria-label="Rechtliche Hinweise">
        <span>Qualitätsmanager Lernplattform · privates Lernprojekt</span>
        <nav>
          <a href="./rechtliches.html#impressum">Impressum</a>
          <a href="./rechtliches.html#datenschutz">Datenschutz</a>
          <a href="./rechtliches.html#nutzungsbedingungen">Nutzung</a>
          <a href="./rechtliches.html#urheberrecht">Urheberrecht</a>
          <a href="./rechtliches.html#pruefungstrainer">Prüfungstrainer</a>
          <a href="./rechtliches.html#ki-transparenz">KI-Transparenz</a>
        </nav>
      </footer>
    </div>`;
  }

  function render() {
    clearInterval(timerHandle);
    if (state.view !== 'videoGuides') {
      clearInterval(videoGuideHandle);
      videoGuideHandle = null;
      state.videoGuidePlaying = false;
      if (globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
    }
    applyDisplaySettings();
    if (state.view === 'home') renderHome();
    else if (state.view === 'session') renderSession();
    else if (state.view === 'result') renderResult();
    else if (state.view === 'catalog') renderCatalog();
    else if (state.view === 'database') renderDatabase();
    else if (state.view === 'info') renderInfo();
    else if (state.view === 'breakPrompt') renderBreakPrompt();
    else if (state.view === 'game') renderGame();
    else if (state.view === 'startSetup') renderStartSetup();
    else if (state.view === 'statistics') renderStatistics();
    else if (state.view === 'settings') renderSettings();
    else if (state.view === 'learningPath') renderLearningPath();
    else if (state.view === 'auditJourney') renderAuditJourney();
    else if (state.view === 'documentSearch') renderDocumentSearch();
    else if (state.view === 'openBookHome') renderOpenBookHome();
    else if (state.view === 'openBookQuestion') renderOpenBookQuestion();
    else if (state.view === 'videoGuides') renderVideoGuides();
    else if (state.view === 'learnSetup') renderLearningSetup();
    else if (state.view === 'examSetup') renderExamSetup();
    window.QMBAccount?.refreshIndicators?.();
    window.scrollTo({top: 0, behavior: 'instant'});
    if (state.tutorialActive) scheduleTutorialStep();
    else scheduleFirstStartTutorial();
    scheduleFiveDayReview();
  }

  function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function examDateDays() {
    return examDateDaysFor(store.examDate);
  }

  function examDateDaysFor(value) {
    if (!value) return null;
    const exam = new Date(`${value}T00:00:00`);
    if (Number.isNaN(exam.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((exam.getTime() - today.getTime()) / 86400000);
  }

  function calendarDaysSince(value) {
    const reference = new Date(value);
    if (Number.isNaN(reference.getTime())) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    reference.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today.getTime() - reference.getTime()) / 86400000));
  }

  function fiveDayReviewReference() {
    const existing = store.fiveDayReviewLastShownAt || store.fiveDayReviewStartedAt;
    if (existing && !Number.isNaN(new Date(existing).getTime())) return existing;
    const firstAttempt = (store.attemptLog || [])
      .map(item => new Date(item.at).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    store.fiveDayReviewStartedAt = new Date(firstAttempt || Date.now()).toISOString();
    saveStore();
    return store.fiveDayReviewStartedAt;
  }

  function fiveDayReviewDue() {
    return calendarDaysSince(fiveDayReviewReference()) >= 5;
  }

  function remainingStudyQuestionCount(questions = getAllQuestions()) {
    const wrongIds = new Set(store.wrongIds || []);
    return questions.filter(question => {
      const answeredCorrectly = Number(store.stats?.[question.uid]?.correct || 0) > 0;
      return !answeredCorrectly || wrongIds.has(question.uid);
    }).length;
  }

  function fiveDayReviewSnapshot() {
    const dateKeys = [];
    for (let offset = 0; offset < 5; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      dateKeys.push(localDateKey(date));
    }
    const dateKeySet = new Set(dateKeys);
    const attempts = (store.attemptLog || []).filter(item => dateKeySet.has(localDateKey(item.at)));
    const correct = attempts.filter(item => item.correct).length;
    const learningDays = new Set(attempts.map(item => localDateKey(item.at)).filter(Boolean)).size;
    const activityDays = mergedActivityDays();
    const activeSeconds = dateKeys.reduce((sum, key) => sum + Math.max(0, Number(activityDays[key] || 0)), 0);
    const questions = getAllQuestions();
    return {
      attempts: attempts.length,
      accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : null,
      learningDays,
      averagePerLearningDay: learningDays ? Math.round(attempts.length / learningDays) : 0,
      activeSeconds,
      questionTotal: questions.length,
      remainingQuestions: remainingStudyQuestionCount(questions)
    };
  }

  function fiveDayLearningPlanMarkup(snapshot, examDate = '') {
    const days = examDateDaysFor(examDate);
    if (days === null) {
      return `<div class="five-day-plan-state waiting"><strong>Prüfungstermin fehlt</strong><p>Trage deinen Termin ein. Danach berechnet die App sofort, wie viele der noch offenen Fragen du rechnerisch pro Tag bearbeiten solltest.</p></div>`;
    }
    const dateLabel = new Date(`${examDate}T00:00:00`).toLocaleDateString('de-DE');
    if (days < 0) {
      return `<div class="five-day-plan-state warning"><strong>Prüfungstermin bitte aktualisieren</strong><p>Der eingetragene Termin ${esc(dateLabel)} liegt bereits zurück. Mit einem neuen Termin kann wieder ein Tagespensum berechnet werden.</p></div>`;
    }
    if (days === 0) {
      const focus = snapshot.remainingQuestions
        ? `Heute sind noch ${snapshot.remainingQuestions} offene oder aktuell falsche Fragen im Lernplan. Konzentriere dich auf deine Fehlerschwerpunkte und kurze Wiederholungen.`
        : 'Alle aktiven Fragen wurden bereits mindestens einmal richtig beantwortet. Wiederhole heute gezielt deine unsicheren Themen.';
      return `<div class="five-day-plan-state today"><strong>Heute ist die Prüfung</strong><p>${esc(focus)}</p></div>`;
    }
    if (!snapshot.remainingQuestions) {
      return `<div class="five-day-plan-state ready"><strong>Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} · alle Fragen einmal richtig</strong><p>Nutze die verbleibende Zeit für Wiederholungen, Fehlerschwerpunkte und Miniprüfungen.</p></div>`;
    }
    const dailyQuestions = Math.ceil(snapshot.remainingQuestions / days);
    return `<div class="five-day-plan-state"><strong>Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} · ${snapshot.remainingQuestions} Fragen im Lernplan</strong><p>Rechnerischer Richtwert: <b>${dailyQuestions} ${dailyQuestions === 1 ? 'Frage' : 'Fragen'} pro Tag</b>, damit jede offene oder aktuell falsche Frage bis zum ${esc(dateLabel)} noch einmal bearbeitet werden kann.</p></div>`;
  }

  function fiveDayReviewMarkup(snapshot) {
    const accuracy = snapshot.accuracy === null ? '–' : `${snapshot.accuracy}%`;
    return `<div class="five-day-review">
      <p class="five-day-review-intro">Dein Überblick berücksichtigt ausschließlich beantwortete Fragen und aktive Lernzeit der letzten fünf Kalendertage.</p>
      <div class="five-day-review-grid">
        <div><span>Bearbeitet</span><strong>${snapshot.attempts}</strong><small>Fragen</small></div>
        <div><span>Trefferquote</span><strong>${accuracy}</strong><small>exakt gewertet</small></div>
        <div><span>Aktive Lernzeit</span><strong>${fmtTime(snapshot.activeSeconds)}</strong><small>Leerlauf zählt nicht</small></div>
        <div><span>Lerntage</span><strong>${snapshot.learningDays}/5</strong><small>Ø ${snapshot.averagePerLearningDay} Fragen</small></div>
      </div>
      <section class="five-day-exam-plan">
        <div class="five-day-exam-heading"><div><span class="eyebrow">Bis zur Prüfung</span><h3>Dein rechnerischer Lernplan</h3></div><label for="fiveDayReviewExamDate">Prüfungstermin<input id="fiveDayReviewExamDate" type="date" value="${esc(store.examDate || '')}"></label></div>
        <div id="fiveDayReviewPlan">${fiveDayLearningPlanMarkup(snapshot, store.examDate || '')}</div>
      </section>
      <p class="five-day-review-note">Der Richtwert ist eine Lernorientierung und keine Aussage über das Bestehen der Prüfung.</p>
    </div>`;
  }

  async function showFiveDayReview(force = false) {
    if (fiveDayReviewOpening || (!force && (state.view !== 'home' || !fiveDayReviewDue()))) return;
    const existingDialog = document.getElementById('appDialog');
    if (!force && existingDialog && !existingDialog.hidden) {
      scheduleFiveDayReview(1500);
      return;
    }
    fiveDayReviewOpening = true;
    store.fiveDayReviewLastShownAt = new Date().toISOString();
    if (!store.fiveDayReviewStartedAt) store.fiveDayReviewStartedAt = store.fiveDayReviewLastShownAt;
    saveStore();
    const snapshot = fiveDayReviewSnapshot();
    try {
      const decision = openAppDialog('', {
        kicker: 'Dein persönlicher Lernrhythmus',
        title: 'Dein 5-Tage-Überblick',
        symbol: '5',
        cancelLabel: 'Schließen',
        confirmLabel: 'Gesamte Statistik öffnen',
        contentHtml: fiveDayReviewMarkup(snapshot),
        contentClass: 'five-day-review-content',
        focusSelector: store.examDate ? '#appDialogConfirm' : '#fiveDayReviewExamDate',
        wide: true
      });
      const examInput = document.getElementById('fiveDayReviewExamDate');
      const plan = document.getElementById('fiveDayReviewPlan');
      const updatePlan = () => {
        if (plan) plan.innerHTML = fiveDayLearningPlanMarkup(snapshot, examInput?.value || '');
      };
      examInput?.addEventListener('change', updatePlan);
      const openStatistics = await decision;
      const selectedDate = examInput?.value || '';
      if (selectedDate !== store.examDate) {
        store.examDate = selectedDate;
        saveStore();
        render();
        toast(selectedDate ? 'Prüfungstermin und Lernplan wurden gespeichert.' : 'Prüfungstermin wurde entfernt.');
      }
      if (openStatistics) {
        state.view = 'statistics';
        render();
      }
    } finally {
      fiveDayReviewOpening = false;
    }
  }

  function scheduleFiveDayReview(delay = 350) {
    clearTimeout(fiveDayReviewTimer);
    if (state.view !== 'home' || fiveDayReviewOpening || state.tutorialActive || Number(store.tutorialCompletedVersion || 0) < TUTORIAL_VERSION) return;
    const account = window.QMBAccount?.getSummary?.();
    const accountReady = !account || ['ready', 'local'].includes(account.tone) || account.label?.startsWith('Offline');
    if (!accountReady) return;
    fiveDayReviewTimer = window.setTimeout(() => showFiveDayReview(false), delay);
  }

  function renderExamDateHome() {
    const days = examDateDays();
    const dateLabel = store.examDate ? new Date(`${store.examDate}T00:00:00`).toLocaleDateString('de-DE') : '';
    const dayText = days === null ? 'Noch kein Prüfungstermin eingetragen.' : days > 1 ? `Noch ${days} Tage bis zur Prüfung.` : days === 1 ? 'Morgen ist die Prüfung.' : days === 0 ? 'Heute ist die Prüfung – viel Erfolg!' : `Der eingetragene Termin war vor ${Math.abs(days)} Tag(en).`;
    const remainingQuestions = days && days > 0 ? remainingStudyQuestionCount() : 0;
    const orientation = days && days > 0
      ? remainingQuestions
        ? `Rechnerische Orientierung bis dahin: etwa ${Math.ceil(remainingQuestions / days)} offene oder aktuell falsche ${Math.ceil(remainingQuestions / days) === 1 ? 'Frage' : 'Fragen'} täglich.`
        : 'Alle aktiven Fragen wurden bereits mindestens einmal richtig beantwortet – jetzt gezielt wiederholen.'
      : '';
    return `<section class="exam-date-home"><div><div class="eyebrow">Prüfungsplanung</div><h2>${dateLabel ? `Prüfung am ${dateLabel}` : 'Prüfungstermin festlegen'}</h2><p>${dayText}${orientation ? ` ${orientation}` : ''}</p></div><label>Termin<input id="mainExamDate" type="date" value="${esc(store.examDate || '')}"></label></section>`;
  }

  function learningSetupCard() {
    const wrongQuestions = currentWrongQuestions();
    return `<article class="mode-card learn-card setup-mode-card" id="mode-learn">
      <div class="mode-top"><div class="mode-icon">L</div><span class="mode-tag">Mit Sofortlösung</span></div>
      <h2>Lernpfad</h2>
      <p>Lösungen direkt prüfen, Hinweise lesen und falsch beantwortete Fragen automatisch sammeln.</p>
      <div class="form-grid">
        <div class="field"><label for="learnCategory">Kategorie</label><select id="learnCategory">${categoryOptions('all')}</select></div>
        <div class="field"><label for="learnOrder">Reihenfolge</label><select id="learnOrder"><option value="sequential">Geordnet</option><option value="random">Zufällig</option></select></div>
      </div>
      <div class="actions"><button class="primary-btn" data-action="start-learn">Lernen starten</button><button class="secondary-btn" data-action="repeat-wrong" ${wrongQuestions.length ? '' : 'disabled'}>Fehlerfragen (${wrongQuestions.length})</button></div>
    </article>`;
  }

  function examSetupCard() {
    const questions = getAllQuestions();
    return `<article class="mode-card exam-card setup-mode-card" id="mode-exam">
      <div class="mode-top"><div class="mode-icon">P</div><span class="mode-tag">Mit Zeitmessung</span></div>
      <h2>Prüfpfad</h2>
      <p>Wähle Miniprüfung, Vollprüfung oder einen individuellen Prüfungsdurchgang.</p>
      <div class="form-grid">
        <div class="field"><label for="examCategory">Kategorie</label><select id="examCategory">${categoryOptions('all')}</select></div>
        <div class="field"><label for="examPreset">Prüfungsformat</label><select id="examPreset"><option value="full">Vollprüfung · 45 Fragen · 90 Min.</option><option value="mini10">Miniprüfung Mini 10 · 5 Fragen · 10 Min.</option><option value="mini20">Miniprüfung Mini 20 · 10 Fragen · 20 Min.</option><option value="mini30">Miniprüfung Mini 30 · 15 Fragen · 30 Min.</option><option value="custom">Benutzerdefiniert</option></select></div>
        <div class="field"><label for="examCount">Fragenanzahl</label><input id="examCount" type="number" min="1" max="${questions.length}" value="45"></div>
        <div class="field"><label for="examMinutes">Zeitlimit</label><div class="input-suffix"><input id="examMinutes" type="number" min="1" max="600" value="90"><span>Min.</span></div></div>
        <div class="field"><label for="passThreshold">Bestehensgrenze</label><div class="input-suffix"><input id="passThreshold" type="number" min="1" max="100" value="${store.passThreshold || 70}"><span>%</span></div></div>
      </div>
      <div class="actions"><button class="primary-btn" data-action="start-exam">Prüfpfad starten</button></div>
      <div class="hint">Richtig ist eine Frage nur, wenn exakt alle richtigen Antworten und keine falsche Antwort markiert wurden.</div>
    </article>`;
  }

  function renderLearningSetup() {
    app.innerHTML = layout(`<section class="standalone-mode-page"><div class="eyebrow">Alle Bereiche · Lernpfad</div><h1>Lernen mit Sofortlösung</h1><p class="lead">Wähle Kategorie und Reihenfolge für deine Lernrunde.</p>${learningSetupCard()}</section>`);
  }

  function renderExamSetup() {
    app.innerHTML = layout(`<section class="standalone-mode-page"><div class="eyebrow">Alle Bereiche · Prüfpfad</div><h1>Prüfung vorbereiten</h1><p class="lead">Lege Format, Umfang und Bestehensgrenze fest.</p>${examSetupCard()}</section>`);
  }

  function renderHome() {
    const questions = getAllQuestions();
    const totalAttempts = Object.values(store.stats || {}).reduce((sum, item) => sum + (item.attempts || 0), 0);
    const totalCorrect = Object.values(store.stats || {}).reduce((sum, item) => sum + (item.correct || 0), 0);
    const accuracy = totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0;
    const datedAttempts = (store.attemptLog || []).filter(item => localDateKey(item.at));
    const activeAttemptDays = new Set(datedAttempts.map(item => localDateKey(item.at))).size;
    const dailyAverage = activeAttemptDays ? Math.round(datedAttempts.length / activeAttemptDays) : 0;
    const todayKey = localDateKey();
    const todayAttempts = datedAttempts.filter(item => localDateKey(item.at) === todayKey).length;
    const dailyGoal = [5,10,20,30,50].includes(Number(store.dailyQuestionGoal)) ? Number(store.dailyQuestionGoal) : 20;
    const dailyRemaining = Math.max(0, dailyGoal - todayAttempts);
    const dailyProgress = Math.min(100, Math.round(todayAttempts / dailyGoal * 100));
    const dailyGoalMessage = dailyRemaining === 0
      ? 'Tagesziel erreicht – wenn du möchtest, kannst du ohne Druck weiterlernen.'
      : dailyRemaining <= 5
        ? `Nur noch ${dailyRemaining} ${dailyRemaining === 1 ? 'Frage' : 'Fragen'} bis zu deinem Tagesziel.`
        : todayAttempts
          ? `Du hast heute schon ${todayAttempts} ${todayAttempts === 1 ? 'Frage' : 'Fragen'} bearbeitet.`
          : 'Beginne in deinem Tempo – jede bearbeitete Frage zählt.';
    const latestAttempt = datedAttempts[datedAttempts.length - 1];
    const competencePool = latestAttempt ? questions.filter(question => question.categoryId === latestAttempt.learningFieldId) : [];
    const competenceLogs = latestAttempt ? datedAttempts.filter(item => item.learningFieldId === latestAttempt.learningFieldId) : [];
    const competenceCorrect = new Set(competenceLogs.filter(item => item.correct).map(item => item.uid)).size;
    const competenceTotal = competencePool.length;
    const competenceProgress = competenceTotal ? Math.min(100, Math.round(competenceCorrect / competenceTotal * 100)) : 0;
    const competenceMessage = competenceProgress >= 80
      ? 'Dieses Lernfeld sitzt bereits sehr gut.'
      : competenceProgress >= 50
        ? 'Du hast schon eine stabile Grundlage aufgebaut.'
        : competenceProgress > 0
          ? 'Deine Grundlage wächst mit jeder bearbeiteten Frage.'
          : 'Sobald du Fragen bearbeitest, wird dein Fortschritt hier sichtbar.';
    app.innerHTML = layout(`
      <section class="hero-panel">
        <div class="hero-content">
          <div class="eyebrow"><span class="status-dot"></span> Qualitätsmanager Lernplattform</div>
          <h1>Professionell lernen. Sicher prüfen. Wissen gezielt festigen.</h1>
          <p class="lead">Dein persönlicher Überblick zeigt nur Lernstand, Tagesziel, Kompetenzfortschritt und Prüfungstermin. Sämtliche Lern-, Prüfungs- und Verwaltungsfunktionen findest du übersichtlich unter „Alle Bereiche“.</p>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="visual-orbit orbit-one"></div>
          <div class="visual-orbit orbit-two"></div>
          <div class="visual-card main-visual-card">
            <div class="visual-icon">✓</div>
            <strong>${questions.length}</strong>
            <span>aktive Fragen</span>
          </div>
          <div class="visual-chip chip-one">${getCategories().length} Kategorien</div>
        </div>
      </section>

      ${store.activeSession ? `<section class="resume-session-card">
        <div>
          <div class="eyebrow">Gespeicherter Durchgang</div>
          <h2>${esc(store.activeSession.label || 'Lernrunde')}</h2>
          <p>${activeSessionPositionText(store.activeSession)}</p>
        </div>
        <div class="actions"><button class="primary-btn" type="button" data-action="resume-session">Genau dort fortsetzen</button><button class="ghost-btn" type="button" data-action="discard-session">Durchgang verwerfen</button></div>
      </section>` : ''}

      <section class="stats">
        <div class="stat"><div class="stat-icon">Q</div><div><strong>${questions.length}</strong><span>Fragen gesamt</span></div></div>
        <div class="stat"><div class="stat-icon">✓</div><div><strong>${totalAttempts}</strong><span>Von dir bearbeitet</span></div></div>
        <div class="stat"><div class="stat-icon">%</div><div><strong>${accuracy}%</strong><span>Trefferquote</span></div></div>
        <div class="stat"><div class="stat-icon">Ø</div><div><strong>${dailyAverage}</strong><span>Täglicher Durchschnitt</span></div></div>
      </section>

      <section class="motivation-dashboard" aria-label="Tagesziel und Kompetenzfortschritt">
        <article class="motivation-card daily-motivation-card ${dailyRemaining > 0 && dailyRemaining <= 5 ? 'near-goal' : ''} ${dailyRemaining === 0 ? 'goal-complete' : ''}">
          <div class="motivation-heading"><span class="motivation-icon">◎</span><div><div class="eyebrow">Dein Tagesziel</div><h2>${todayAttempts} von ${dailyGoal} Fragen</h2></div></div>
          <p class="motivation-message">${dailyGoalMessage}</p>
          <div class="motivation-progress" role="progressbar" aria-label="Tagesziel" aria-valuemin="0" aria-valuemax="${dailyGoal}" aria-valuenow="${Math.min(todayAttempts, dailyGoal)}"><span style="width:${dailyProgress}%"></span></div>
          <label class="daily-goal-select">Fragen pro Tag<select id="dailyQuestionGoal">${[5,10,20,30,50].map(value => `<option value="${value}" ${dailyGoal === value ? 'selected' : ''}>${value} Fragen</option>`).join('')}</select></label>
        </article>

        <article class="motivation-card competence-motivation-card">
          <div class="motivation-heading"><span class="motivation-icon">◇</span><div><div class="eyebrow">Kompetenzfortschritt</div><h2>${latestAttempt ? esc(latestAttempt.learningField || 'Aktuelles Lernfeld') : 'Bereit für dein erstes Lernfeld'}</h2></div></div>
          <p class="motivation-message">${latestAttempt && competenceTotal ? `<strong>${competenceCorrect} von ${competenceTotal}</strong> Fragen mindestens einmal richtig beantwortet. ` : ''}${competenceMessage}</p>
          <div class="motivation-progress competence-progress" role="progressbar" aria-label="Kompetenzfortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${competenceProgress}"><span style="width:${competenceProgress}%"></span></div>
          <div class="motivation-foot"><span>${competenceProgress}% im aktuellen Lernfeld</span><button class="ghost-btn compact-btn" type="button" data-action="quick-menu">Alle Bereiche öffnen</button></div>
        </article>
      </section>

      ${renderExamDateHome()}

      <section class="transparency-strip">
        <div>
          <strong>Privat, transparent und kontogebunden</strong>
          <p>Die App arbeitet lokal und synchronisiert nur verschlüsselte Lerndaten. Bei der normalen Nutzung werden keine Fragen, Antworten, PDFs oder Lernstände an einen KI-Dienst übertragen.</p>
        </div>
        <button class="ghost-btn" type="button" data-action="info">Recht &amp; Transparenz</button>
      </section>

    `);
  }

  function prepareQuestionsForSession(mode, pool, options = {}) {
    const selectedQuestions = mode === 'exam'
      ? shuffle(pool).slice(0, Math.min(options.count || 45, pool.length))
      : (options.random ? shuffle(pool) : [...pool]);
    const runId = options.runId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const cycle = Number(options.cycle || 1);

    // Für jeden Durchgang werden nur die Antwortpositionen neu gemischt.
    // Die Fragenreihenfolge im Lernpfad bleibt stabil, damit kein festes Zahlenmuster gelernt wird.
    // Im Lernpfad wird der vollständige Fragenpool verwendet – keine Begrenzung auf 12 Fragen.
    return selectedQuestions.map((question, index) => ({
      ...question,
      sessionUid: `${question.uid}::${runId}::${cycle}::${index}`,
      answers: shuffle((question.answers || []).map(answer => ({...answer})))
    }));
  }

  function requestSessionStart(mode, pool, options = {}) {
    if (!pool.length) {
      toast('Für diese Auswahl sind keine Fragen vorhanden.');
      return;
    }
    state.pendingSession = {mode, pool, options};
    state.view = 'startSetup';
    render();
  }




  const LOCAL_DOCUMENTS = {
    iso: {step:1, title:'ISO-Unterlage', description:'Deine ISO-Normenübersicht oder zugelassene ISO-Prüfungsunterlage'},
    modul1: {step:2, title:'TÜV Modul 1', description:'Dein rechtmäßig vorhandenes Lehrgangsskript für Modul 1'},
    modul2: {step:3, title:'TÜV Modul 2', description:'Dein rechtmäßig vorhandenes Lehrgangsskript für Modul 2'}
  };
  const LOCAL_DOCUMENT_DB = 'qmb-local-documents-v1';
  const LOCAL_DOCUMENT_STORE = 'documents';
  const localDocumentCache = new Map();
  const localDocumentUrls = new Set();
  let localDocumentDbPromise = null;

  function openLocalDocumentDatabase() {
    if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Dieser Browser bietet keinen lokalen PDF-Speicher an.'));
    if (localDocumentDbPromise) return localDocumentDbPromise;
    localDocumentDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCAL_DOCUMENT_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(LOCAL_DOCUMENT_STORE)) {
          request.result.createObjectStore(LOCAL_DOCUMENT_STORE, {keyPath:'id'});
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          localDocumentDbPromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        localDocumentDbPromise = null;
        reject(request.error || new Error('Der lokale PDF-Speicher konnte nicht geöffnet werden.'));
      };
    });
    return localDocumentDbPromise;
  }

  async function localDocumentRequest(mode, callback) {
    const db = await openLocalDocumentDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LOCAL_DOCUMENT_STORE, mode);
      const request = callback(transaction.objectStore(LOCAL_DOCUMENT_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Die lokale PDF konnte nicht verarbeitet werden.'));
      transaction.onabort = () => reject(transaction.error || new Error('Der lokale Speichervorgang wurde abgebrochen.'));
    });
  }

  async function getLocalDocument(source) {
    if (!LOCAL_DOCUMENTS[source]) return null;
    const record = await localDocumentRequest('readonly', store => store.get(source));
    if (record) localDocumentCache.set(source, record);
    else localDocumentCache.delete(source);
    return record || null;
  }

  async function getAllLocalDocuments() {
    const records = await localDocumentRequest('readonly', store => store.getAll());
    localDocumentCache.clear();
    (records || []).forEach(record => {
      if (LOCAL_DOCUMENTS[record?.id]) localDocumentCache.set(record.id, record);
    });
    return [...localDocumentCache.values()];
  }

  async function saveLocalDocument(source, file) {
    const record = {
      id: source,
      name: file.name,
      type: 'application/pdf',
      size: file.size,
      lastModified: file.lastModified || null,
      savedAt: new Date().toISOString(),
      blob: file.slice(0, file.size, 'application/pdf')
    };
    await localDocumentRequest('readwrite', store => store.put(record));
    localDocumentCache.set(source, record);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    return record;
  }

  async function removeLocalDocument(source) {
    await localDocumentRequest('readwrite', store => store.delete(source));
    localDocumentCache.delete(source);
  }

  async function clearLocalDocuments() {
    try {
      await localDocumentRequest('readwrite', store => store.clear());
      localDocumentCache.clear();
    } catch (error) {
      console.warn('Lokale PDFs konnten nicht vollständig gelöscht werden.', error);
    }
  }

  function formatFileSize(size) {
    const bytes = Number(size || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function localDocumentSetupMarkup(records) {
    const recordMap = new Map(records.map(record => [record.id, record]));
    const readyCount = Object.keys(LOCAL_DOCUMENTS).filter(id => recordMap.has(id)).length;
    const cards = Object.entries(LOCAL_DOCUMENTS).map(([id, doc]) => {
      const record = recordMap.get(id);
      const selected = state.documentSearchSource === id;
      return `<article class="local-document-card ${record ? 'ready' : ''} ${selected ? 'active' : ''}">
        <div class="local-document-step"><span>Schritt ${doc.step}</span><b>${record ? '✓ Bereit' : 'Noch auswählen'}</b></div>
        <div class="local-document-heading"><span>${doc.step}</span><div><h2>${esc(doc.title)}</h2><p>${esc(doc.description)}</p></div></div>
        <div class="local-document-file ${record ? 'ready' : ''}">
          <span aria-hidden="true">${record ? '✓' : 'PDF'}</span>
          <div><strong>${record ? esc(record.name) : 'Keine Datei ausgewählt'}</strong><small>${record ? `${formatFileSize(record.size)} · lokal gespeichert ${new Date(record.savedAt).toLocaleDateString('de-DE')}` : 'Die App enthält dieses Dokument nicht.'}</small></div>
        </div>
        <input type="file" accept="application/pdf,.pdf" hidden data-local-document-input="${id}">
        <div class="actions local-document-actions">
          <button class="${record ? 'secondary-btn' : 'primary-btn'}" type="button" data-action="choose-local-document" data-source="${id}">${record ? 'Andere PDF auswählen' : 'PDF auswählen'}</button>
          ${record ? `<button class="primary-btn" type="button" data-action="open-local-document" data-source="${id}">Öffnen &amp; durchsuchen</button><button class="ghost-btn" type="button" data-action="remove-local-document" data-source="${id}">Entfernen</button>` : ''}
        </div>
      </article>`;
    }).join('');
    return `<section class="local-document-progress" aria-label="Einrichtungsfortschritt"><div><strong>${readyCount} von 3 Unterlagen eingerichtet</strong><span>${readyCount === 3 ? 'Alle Unterlagen sind auf diesem Gerät einsatzbereit.' : 'Arbeite die drei Schritte nacheinander ab.'}</span></div><div class="path-progress"><span style="width:${readyCount / 3 * 100}%"></span></div></section><div class="local-document-grid">${cards}</div>`;
  }

  async function hydrateLocalDocumentSetup() {
    const host = document.getElementById('localDocumentSetup');
    if (!host) return;
    try {
      const records = await getAllLocalDocuments();
      if (host.isConnected) host.innerHTML = localDocumentSetupMarkup(records);
    } catch (error) {
      if (host.isConnected) host.innerHTML = `<div class="local-document-error"><strong>Lokaler PDF-Speicher nicht verfügbar</strong><p>${esc(error.message || 'Bitte prüfe die Browsereinstellungen und erlaube lokalen Website-Speicher.')}</p></div>`;
    }
  }

  async function handleLocalDocumentSelection(source, file) {
    const doc = LOCAL_DOCUMENTS[source];
    if (!doc || !file) return;
    const signature = await file.slice(0, 5).text().catch(() => '');
    if (!file.name.toLowerCase().endsWith('.pdf') || signature !== '%PDF-') {
      await appAlert('Bitte wähle eine echte PDF-Datei aus deinem eigenen Bestand aus.', {title:'Keine gültige PDF',symbol:'PDF'});
      return;
    }
    try {
      await saveLocalDocument(source, file);
      state.documentSearchSource = source;
      await hydrateLocalDocumentSetup();
      toast(`${doc.title} wurde nur auf diesem Gerät gespeichert.`);
    } catch (error) {
      await appAlert('Die PDF konnte nicht lokal gespeichert werden. Prüfe den freien Gerätespeicher und ob Website-Daten erlaubt sind.', {title:'Speichern nicht möglich',symbol:'!'});
    }
  }

  async function openLocalDocument(source, preparedWindow = null) {
    const doc = LOCAL_DOCUMENTS[source];
    let record = localDocumentCache.get(source);
    try {
      if (!record) record = await getLocalDocument(source);
    } catch (error) {
      if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
      await appAlert('Auf den lokalen PDF-Speicher konnte nicht zugegriffen werden.', {title:'PDF nicht verfügbar',symbol:'!'});
      return false;
    }
    if (!doc || !record?.blob) {
      if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
      state.documentSearchSource = source || 'iso';
      state.view = 'documentSearch';
      render();
      await appAlert('Wähle diese PDF zuerst über den passenden Schritt aus. Die App liefert keine Prüfungsunterlagen mit.', {title:'Eigene PDF auswählen',symbol:'PDF'});
      return false;
    }
    const url = URL.createObjectURL(record.blob);
    localDocumentUrls.add(url);
    const target = preparedWindow && !preparedWindow.closed ? preparedWindow : window.open(url, '_blank');
    if (target) {
      if (preparedWindow) target.location.href = url;
      try { target.opener = null; } catch (_) {}
      return true;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  window.addEventListener('beforeunload', () => {
    localDocumentUrls.forEach(url => URL.revokeObjectURL(url));
    localDocumentUrls.clear();
  });

  function verifiedSourceNotes(question) {
    const raw = [];
    if (question?.questionComment) raw.push(question.questionComment);
    (question?.answers || []).forEach(answer => { if (answer.comment) raw.push(answer.comment); });
    const unique = [...new Set(raw.map(x => String(x).trim()).filter(Boolean))];
    return unique.filter(note => /(ISO|DIN|TÜV|Modul\s*[12]|Kapitel|Kap\.)/i.test(note));
  }

  function renderDocumentSearch() {
    app.innerHTML = layout(`<section class="document-search-page">
      <div class="eyebrow">Eigene Prüfungsunterlagen · nur lokal</div><h1>PDF-Suche in drei einfachen Schritten einrichten</h1>
      <p class="lead">Die App bringt keine ISO- oder TÜV-PDFs mit. Du wählst die Dateien selbst aus deinem rechtmäßig vorhandenen Bestand aus – sie werden nicht hochgeladen.</p>
      <section class="local-document-guide">
        <div><b>1</b><span><strong>Dateien bereitlegen</strong><small>Speichere deine drei PDFs auf diesem Computer oder Smartphone.</small></span></div>
        <div><b>2</b><span><strong>Passend auswählen</strong><small>Tippe bei jedem Schritt auf „PDF auswählen“ und wähle die richtige Datei.</small></span></div>
        <div><b>3</b><span><strong>Öffnen und suchen</strong><small>Nutze im PDF-Reader die Lupe oder „Im Dokument suchen“.</small></span></div>
      </section>
      <div id="localDocumentSetup"><div class="local-document-loading">Lokale Unterlagen werden geprüft …</div></div>
      <div class="local-document-privacy"><strong>Privat und gerätegebunden:</strong> Der Browser gibt den vollständigen Dateipfad aus Sicherheitsgründen nicht an die App weiter. Stattdessen wird eine lokale Arbeitskopie im Browser dieses Geräts gespeichert. Für ein weiteres Gerät wählst du deine PDFs dort erneut aus. Die PDFs sind nicht Bestandteil der JSON-Sicherung.</div>
      <div class="verified-only-note"><strong>Wichtig:</strong> Verwende nur Unterlagen, zu deren privater Nutzung du berechtigt bist. Wenn Browserdaten gelöscht werden, müssen die PDFs erneut ausgewählt werden.</div>
    </section>`);
    hydrateLocalDocumentSetup();
  }

  function renderLearningPath() {
    const moduleCards = LEARNING_PATH_MODULES.map(module => {
      const st = moduleStats(module);
      const pool = questionsForLearningModule(module);
      const activePath = store.activeSession?.mode === 'path' && store.activeSession?.pathModuleId === module.id;
      const status = activePath ? 'Fortlaufender Lernpfad pausiert' : st.stage;
      const cls = (st.started || activePath) ? 'active' : '';
      return `<article class="path-module ${cls}">
        <div class="path-module-number">${module.icon}</div>
        <div class="path-module-main"><div class="path-module-head"><div><span class="path-status">${esc(module.group)} · ${status}</span><h2>${esc(module.title)}</h2></div><strong>${st.attempts ? st.accuracy+'%' : '–'}</strong></div>
        <p>${esc(module.short)}</p><div class="path-progress"><span style="width:${Math.min(100, st.attempts * 2)}%"></span></div>
        <div class="path-meta"><span>${pool.length} passende Fragen</span><span>${st.attempts} Versuche</span><span>${st.correct} richtig</span></div>
        <details class="path-details"><summary>Lernziel und Quellen</summary><div><p><strong>Lernziel:</strong> ${esc(module.goal)}</p><p><strong>Denkimpuls:</strong> ${esc(module.impulse)}</p><ul><li>${esc(module.iso)}</li><li>${esc(module.m1)}</li><li>${esc(module.m2)}</li></ul></div></details>
        ${renderIntegratedVideoSupport(module)}
        <div class="actions"><button class="primary-btn" data-action="${activePath ? 'resume-session' : 'start-path-module'}" data-module="${module.id}">${activePath ? 'Genau hier fortsetzen' : st.started ? 'Neue fortlaufende Runde' : 'Abschnitt beginnen'}</button><button class="ghost-btn" data-action="open-path-docs">Dokumente öffnen</button></div></div>
      </article>`;
    }).join('');
    const totalPathAnswers = LEARNING_PATH_MODULES.reduce((sum,m)=>sum+moduleStats(m).attempts,0);
    app.innerHTML=layout(`<div class="path-page">
      <section class="path-hero"><div><div class="eyebrow">22 Quellkapitel · ISO-Normen · QM Modul 1 · QM Modul 2</div><h1>Qualitätsmanager Lernpfad</h1><p class="lead">Entdecken → Verstehen → Verknüpfen → Anwenden → Prüfen → Wiederholen. Die Kapitelaufteilung folgt der ISO-Normensammlung und den beiden bereitgestellten QM-Lehrgangsskripten. Jede der 843 Fragen ist genau einem Kapitel zugeordnet.</p><div class="inspiration-note"><strong>Didaktische Orientierung</strong><p>Die zehn ISO-Kapitel bilden den normativen Rahmen. Fünf Kapitel aus QM Modul 1 und sieben Kapitel aus QM Modul 2 vertiefen Methoden, Führung und Recht.</p></div></div><div class="path-overview"><strong>${totalPathAnswers}</strong><span>beantwortete Lernpfadfragen</span><div class="path-progress large"><span style="width:${Math.min(100,totalPathAnswers/2)}%"></span></div><small>Kein künstliches Ende – Sicherheit wächst durch Wiederholung.</small></div></section>
      <section class="video-path-invite"><div class="video-path-play" aria-hidden="true">▶</div><div><div class="eyebrow">Optionale Gesamtübersicht</div><h2>${PUBLISHED_VIDEO_GUIDES.length} visuelle Ergänzungen sind in den Lernpfaden eingegliedert</h2><p>Der Hauptzugang liegt in „ISO 9000 · Grundlagen &amp; Begriffe“ und „Modul 1 · Grundlagen des Prozessmanagements“.</p></div><button class="primary-btn" type="button" data-action="video-guides">Videoübersicht öffnen</button></section>
      <section class="audit-method compact-audit-invite"><div><div class="eyebrow">Interaktive Betriebsbegehung</div><h2>Abstrakte Normfragen im CARAT-Betrieb erleben</h2><p>Dieser Lernzugang nutzt dieselben Originalfragen, ergänzt aber eine zusammenhängende Betriebsbegehung als Verständnishilfe und Gedächtnisstruktur.</p></div><button class="primary-btn" data-action="audit-journey">Betriebsbegehung öffnen</button></section>
      <section class="path-documents"><div><div class="eyebrow">Eigene Unterlagen</div><h2>Beim Lernen direkt nachschlagen</h2><p>Richte deine PDFs einmal lokal ein. Danach kannst du sie auf diesem Gerät öffnen und mit der Suchfunktion des PDF-Readers durchsuchen.</p></div><div class="actions"><button class="secondary-btn" data-action="document-search" data-source="iso">PDFs einrichten &amp; suchen</button></div></section>
      <section class="path-modules">${moduleCards}</section>
    </div>`);
  }

  function renderStartSetup() {
    const pending = state.pendingSession;
    if (!pending) { state.view = 'home'; render(); return; }
    const modeName = pending.mode === 'exam' ? 'Prüfung' : pending.mode === 'review' ? 'Fehlertraining' : pending.mode === 'path' ? 'Fortlaufenden Lernpfad' : pending.mode === 'audit' ? 'Interaktive Betriebsbegehung' : pending.mode === 'openbook' ? 'ISO-/TÜV-Lernmodul' : 'Lernrunde';
    app.innerHTML = layout(`<section class="start-setup-shell">
      <div class="start-setup-badge">Vor dem Start</div>
      <h1>${modeName} vorbereiten</h1>
      <p class="lead">Möchtest du nach 20 oder 50 beantworteten Fragen eine wechselnde Erholungspause mit Minispiel nutzen?</p>
      <div class="start-choice-grid">
        <button class="start-choice positive" data-action="confirm-start" data-pause="yes">
          <span class="start-choice-icon">✓</span>
          <strong>Ja, Erholungspausen nutzen</strong>
          <small>Atemwelle, Fernblick und Lockerung wechseln automatisch.</small>
        </button>
        <button class="start-choice neutral" data-action="confirm-start" data-pause="no">
          <span class="start-choice-icon">→</span>
          <strong>Nein, direkt starten</strong>
          <small>Die Runde läuft ohne automatische Unterbrechung.</small>
        </button>
      </div>
      <div class="duration-panel break-interval-panel">
        <label>Nach wie vielen Fragen soll die Erholungspause erscheinen?</label>
        <div class="break-interval-options">
          <label class="break-interval-option recommended"><input type="radio" name="startBreakEvery" value="20" ${Number(store.breakEveryQuestions || 20) === 20 ? 'checked' : ''}><span><strong>20 Fragen</strong><small>Empfohlen · frühere Erholung für Konzentration und Aufnahmefähigkeit</small></span></label>
          <label class="break-interval-option"><input type="radio" name="startBreakEvery" value="50" ${Number(store.breakEveryQuestions || 20) === 50 ? 'checked' : ''}><span><strong>50 Fragen</strong><small>Längere Lernphase bis zur nächsten Erholungspause</small></span></label>
        </div>
        <p class="brain-recovery-note"><strong>Warum 20?</strong> Häufigere kurze Pausen geben dem Gehirn früher Gelegenheit, sich zu erholen und neue Inhalte zu verarbeiten.</p>
      </div>
      <div class="duration-panel">
        <label for="startBreakDuration">Pausendauer bei Auswahl „Ja“</label>
        <div class="duration-options">
          ${[2,3,4,5].map(min => `<label><input type="radio" name="startBreakDuration" value="${min}" ${Number(store.breakDurationMinutes || 3) === min ? 'checked' : ''}><span>${min} Min.</span></label>`).join('')}
        </div>
      </div>
      <div class="data-foundation-note"><strong>Prüfungsgrundlage:</strong> Der vorhandene ursprüngliche Fragenbestand bleibt vollständig erhalten. Fragen und Antworten werden nur neu angeordnet, nicht inhaltlich verändert.</div>
      <button class="ghost-btn" data-action="cancel-start">Zurück</button>
    </section>`);
  }

  function startSession(mode, pool, options = {}) {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const questions = prepareQuestionsForSession(mode, pool, {...options, runId, cycle: 1});
    const breakEvery = [20,50].includes(Number(options.breakEveryQuestions)) ? Number(options.breakEveryQuestions) : Number(store.breakEveryQuestions || 20);
    state.session = {
      mode,
      questions,
      index: 0,
      selections: {},
      checked: {},
      hints: {},
      flagged: {},
      caratHelpShown: {},
      startedAt: Date.now(),
      endedAt: null,
      threshold: options.threshold || store.passThreshold || 70,
      timeLimitSeconds: Number(options.timeLimitSeconds || 0),
      timedOut: false,
      label: options.label || 'Lernmodus',
      examType: options.examType || (mode === 'exam' ? 'custom' : null),
      pathModuleId: options.pathModuleId || null,
      auditChapterId: options.auditChapterId || null,
      auditChapterNumber: options.auditChapterNumber || null,
      breakGameEnabled: Boolean(options.breakGameEnabled),
      breakDurationMinutes: Number(options.breakDurationMinutes || store.breakDurationMinutes || 3),
      breakEveryQuestions: breakEvery,
      breakAnsweredInSession: 0,
      breakNextAtInSession: breakEvery,
      completedUids: [],
      sessionRunId: runId,
      pathPoolUids: mode === 'path' ? pool.map(question => question.uid) : [],
      pathCycle: mode === 'path' ? 1 : 0,
      pathAnsweredTotal: 0,
      auditAnsweredTotal: 0,
      currentQuestionStartedAt: Date.now(),
      activeMilliseconds: 0,
      questionActiveMilliseconds: {},
      lastActivityAt: Date.now(),
      correctInSession: 0,
      wrongInSession: 0
    };
    state.pendingSession = null;
    state.view = 'session';
    saveActiveSession();
    render();
  }

  function speechAvailable() {
    return Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);
  }

  function speakInstruction(text) {
    if (!speechAvailable() || !text) return false;
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = 'de-DE';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    globalThis.speechSynthesis.speak(utterance);
    return true;
  }

  function currentRestInstruction() {
    const game = state.game;
    if (!game) return '';
    if (game.module.id === 'distance') return DISTANCE_CUES[Math.max(0, game.cueIndex) % DISTANCE_CUES.length] || DISTANCE_CUES[0];
    if (game.module.id === 'move') return MOVE_CUES[Math.max(0, game.cueIndex) % MOVE_CUES.length] || MOVE_CUES[0];
    return 'Atme bequem ein, wenn der Kreis größer wird, und etwas länger aus, wenn er kleiner wird.';
  }

  const BREAK_MODULES = [
    {id: 'breath', title: 'Atemwelle', subtitle: 'Ruhiger Rhythmus ohne Leistungsdruck', icon: '◯'},
    {id: 'distance', title: 'Fernblick-Suche', subtitle: 'Blick und Aufmerksamkeit vom Bildschirm lösen', icon: '⌁'},
    {id: 'move', title: 'Lockerungs-Roulette', subtitle: 'Kleine Bewegung statt weiterem Denksport', icon: '↻'}
  ];

  function registerAnsweredQuestion(question) {
    const session = state.session;
    if (!session || !session.breakGameEnabled) return false;
    if (!Array.isArray(session.completedUids)) session.completedUids = [];
    const key = sessionQuestionKey(question);
    if (session.completedUids.includes(key)) return false;
    session.completedUids.push(key);
    session.breakAnsweredInSession = Number(session.breakAnsweredInSession || 0) + 1;
    store.breakAnsweredTotal = Number(store.breakAnsweredTotal || 0) + 1;
    const breakEvery = [20,50].includes(Number(session.breakEveryQuestions)) ? Number(session.breakEveryQuestions) : Number(store.breakEveryQuestions || 20);
    session.breakEveryQuestions = breakEvery;
    if (!Number.isFinite(Number(session.breakNextAtInSession)) || Number(session.breakNextAtInSession) < breakEvery) session.breakNextAtInSession = breakEvery;
    const reached = Number(session.breakAnsweredInSession) >= Number(session.breakNextAtInSession);
    saveStore();
    if (!reached) return false;
    const moduleIndex = Number(store.breakRotationIndex || 0) % BREAK_MODULES.length;
    state.breakPrompt = {
      returnView: 'session',
      milestone: session.breakNextAtInSession,
      moduleIndex
    };
    session.breakNextAtInSession += breakEvery;
    store.breakRotationIndex = (moduleIndex + 1) % BREAK_MODULES.length;
    saveActiveSession();
    state.view = 'breakPrompt';
    render();
    return true;
  }

  function renderBreakPrompt() {
    const milestone = state.breakPrompt?.milestone || store.breakAnsweredTotal;
    const module = BREAK_MODULES[state.breakPrompt?.moduleIndex || 0];
    app.innerHTML = layout(`<section class="break-prompt-card restorative-prompt">
      <div class="break-symbol">${module.icon}</div>
      <div class="eyebrow">${milestone} Fragen geschafft</div>
      <h1>Zeit für eine echte Entlastung</h1>
      <p class="lead">Als Nächstes: <strong>${module.title}</strong> – ${module.subtitle}.</p>
      <p>Die Pausen wechseln automatisch. Es gibt keine Punkte, keine Bestenliste und keine zusätzliche Prüfungsaufgabe.</p>
      <div class="break-choice-grid single-choice">
        <button class="break-choice featured" data-action="start-game" data-minutes="${state.session?.breakDurationMinutes || state.openBookPause?.duration || store.breakDurationMinutes || 3}"><strong>Pause starten</strong><span>${state.session?.breakDurationMinutes || state.openBookPause?.duration || store.breakDurationMinutes || 3} Minuten · ${module.title}</span></button>
      </div>
      <div class="actions centered-actions">
        <button class="secondary-btn" data-action="skip-game">Diesmal überspringen</button>
        <button class="ghost-btn" data-action="disable-game-session">Für diese Lernrunde ausschalten</button>
      </div>
    </section>`);
  }

  const MOVE_CUES = [
    'Schultern langsam nach hinten kreisen.',
    'Hände ausschütteln und Finger weit öffnen.',
    'Aufrichten, Kinn leicht zurücknehmen, ruhig ausatmen.',
    'Beide Füße fest aufstellen und die Beine kurz lockern.',
    'Arme nach oben strecken – nur so weit, wie es angenehm ist.'
  ];
  const DISTANCE_CUES = [
    'Schau aus dem Fenster oder mindestens sechs Meter weit.',
    'Finde drei ruhige Formen oder Farben in der Ferne.',
    'Lass den Blick weich werden und blinzle bewusst.',
    'Wechsle langsam zwischen einem nahen und einem fernen Punkt.'
  ];

  function updateRestTimer() {
    const game = state.game;
    if (!game || state.view !== 'game') return;
    const left = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
    const el = document.getElementById('gameTime');
    if (el) el.textContent = fmtTime(left);
    const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
    const cueIndex = Math.floor(elapsed / 20);
    if (cueIndex !== game.cueIndex) {
      game.cueIndex = cueIndex;
      const cue = document.getElementById('restCue');
      if (cue) {
        if (game.module.id === 'move') cue.textContent = MOVE_CUES[cueIndex % MOVE_CUES.length];
        if (game.module.id === 'distance') cue.textContent = DISTANCE_CUES[cueIndex % DISTANCE_CUES.length];
      }
      if ((game.module.id === 'move' || game.module.id === 'distance') && cueIndex > 0) {
        speakInstruction(currentRestInstruction());
      }
    }
    if (left <= 0) endGameBreak();
  }

  function startGameBreak(minutes) {
    const moduleIndex = state.breakPrompt?.moduleIndex ?? (Number(store.breakRotationIndex || 0) % BREAK_MODULES.length);
    state.game = {
      module: BREAK_MODULES[moduleIndex],
      startedAt: Date.now(),
      endsAt: Date.now() + minutes * 60 * 1000,
      minutes,
      cueIndex: -1
    };
    state.view = 'game';
    render();
    window.setTimeout(() => speakInstruction(currentRestInstruction()), 250);
  }

  function renderGame() {
    const game = state.game;
    let activity = '';
    if (game.module.id === 'breath') {
      activity = `<div class="breath-stage" aria-label="Ruhiger Atemrhythmus">
        <div class="breath-orb"><span>ruhig</span></div>
        <p id="restCue">Atme bequem ein, wenn der Kreis größer wird, und länger aus, wenn er kleiner wird.</p>
      </div>`;
    } else if (game.module.id === 'distance') {
      activity = `<div class="distance-stage">
        <div class="distance-icon">⌁</div>
        <p id="restCue">${DISTANCE_CUES[0]}</p>
        <p class="rest-small">Lege das Gerät ab und löse den Blick vom Bildschirm. Die nächste Anweisung wird automatisch vorgelesen.</p>
      </div>`;
    } else {
      activity = `<div class="move-stage">
        <div class="move-icon">↻</div>
        <p id="restCue">${MOVE_CUES[0]}</p>
        <p class="rest-small">Langsam und schmerzfrei bewegen. Es geht nicht um Training, sondern um einen Wechsel der Beanspruchung.</p>
      </div>`;
    }
    app.innerHTML = layout(`<section class="game-shell restorative-shell">
      <div class="game-head"><div><div class="eyebrow">Erholungspause ${game.module.icon}</div><h1>${game.module.title}</h1><p>${game.module.subtitle}</p></div>
      <div class="game-stats"><span>Restzeit <strong id="gameTime">${fmtTime(game.minutes * 60)}</strong></span></div></div>
      ${activity}
      <div class="actions centered-actions">${speechAvailable() ? '<button class="primary-btn" data-action="speak-break">🔊 Anweisung noch einmal vorlesen</button>' : '<span class="speech-unavailable">Sprachausgabe ist in diesem Browser nicht verfügbar.</span>'}<button class="secondary-btn" data-action="end-game">Pause beenden und weiterlernen</button></div>
    </section>`);
    timerHandle = setInterval(updateRestTimer, 1000);
    updateRestTimer();
  }

  function endGameBreak() {
    clearInterval(timerHandle);
    if (globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
    const returnView = state.breakPrompt?.returnView || (state.session ? 'session' : 'home');
    state.game = null;
    state.breakPrompt = null;
    state.view = returnView;
    render();
    toast('Erholungspause beendet – weiter geht’s.');
  }

  function renderSession() {
    const session = state.session;
    const question = session.questions[session.index];
    const questionKey = sessionQuestionKey(question);
    const selected = selectedForQuestion(question);
    const checked = Boolean(session.checked[questionKey]);
    const correct = correctIndexes(question);
    const isRight = sameSet(selected, correct);
    const breakEvery = [20,50].includes(Number(session.breakEveryQuestions)) ? Number(session.breakEveryQuestions) : 20;
    const breakBase = Math.max(0, Number(session.breakNextAtInSession || breakEvery) - breakEvery);
    const percent = session.mode === 'path'
      ? Math.max(0, Math.min(100, ((Number(session.breakAnsweredInSession || 0) - breakBase) / breakEvery) * 100))
      : Math.round((session.index + 1) / session.questions.length * 100);
    const pathQuestionNumber = Math.max(1, Number(session.pathAnsweredTotal || 0) + (checked ? 0 : 1));
    const untilBreak = Math.max(0, Number(session.breakNextAtInSession || breakEvery) - Number(session.breakAnsweredInSession || 0));
    const hintVisible = Boolean(session.hints?.[questionKey]);
    const caratHelpVisible = Boolean(session.caratHelpShown?.[questionKey]);

    const answers = question.answers.map((answer, index) => {
      const isSelected = selected.includes(index);
      let className = '';
      let badge = '';
      if (checked) {
        if (answer.correct) {
          className = isSelected ? 'correct' : 'missed';
          badge = isSelected ? '✓ RICHTIG AUSGEWÄHLT' : '✓ RICHTIGE LÖSUNG – NICHT AUSGEWÄHLT';
        } else if (isSelected) {
          className = 'incorrect';
          badge = '✕ FALSCH AUSGEWÄHLT';
        }
      }
      return `<label class="answer ${className}">
        <input type="checkbox" data-answer="${index}" ${isSelected ? 'checked' : ''} ${checked ? 'disabled' : ''}>
        <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
        <span class="answer-text">${esc(answer.text)}</span>
        ${badge ? `<span class="answer-badge ${answer.correct ? 'tag-ok' : 'tag-bad'}">${badge}</span>` : ''}
        ${checked && answer.comment ? `<span class="answer-explanation"><strong>${answer.correct ? 'Warum richtig:' : 'Warum nicht:'}</strong> ${esc(answer.comment)}</span>` : ''}
      </label>`;
    }).join('');

    let feedback = '';
    if (checked) {
      const hasVerifiedSource = question.sourceStatus !== 'limited' && Boolean(question.sourceRef);
      const sourceClass = hasVerifiedSource ? 'verified-evidence' : 'unverified-evidence';
      const sourceTitle = hasVerifiedSource ? 'Nachvollziehbarer Quellenbezug' : 'Quellenlage nicht vollständig';
      feedback = `<div class="feedback ${isRight ? 'ok' : 'bad'}" role="status" aria-live="assertive">
        <div class="feedback-icon" aria-hidden="true">${isRight ? '✓' : '✕'}</div>
        <div><h3>${isRight ? 'RICHTIG' : 'FALSCH'}</h3>
        <p>${isRight ? 'Deine Auswahl stimmt vollständig mit der hinterlegten Lösung überein.' : 'Deine Auswahl ist nicht vollständig korrekt. Grün kennzeichnet die richtige Lösung; Rot kennzeichnet eine falsch ausgewählte Antwort.'}</p>
        ${question.questionComment ? `<div class="solution-explanation"><strong>Zusammenhang:</strong><p>${esc(question.questionComment)}</p></div>` : ''}
        ${question.sourceRef ? `<div class="${sourceClass}"><strong>${sourceTitle}:</strong><p>${esc(question.sourceRef)}</p>${!hasVerifiedSource ? '<p>Es wird bewusst keine weitergehende Fachbehauptung ergänzt, die sich nicht aus ISO, TÜV Modul 1 oder TÜV Modul 2 belegen lässt.</p>' : ''}<div class="actions"><button class="mini-source-btn" data-action="document-search" data-source="iso">ISO prüfen</button><button class="mini-source-btn" data-action="document-search" data-source="modul1">Modul 1 prüfen</button><button class="mini-source-btn" data-action="document-search" data-source="modul2">Modul 2 prüfen</button></div></div>` : `<div class="unverified-evidence"><strong>Individuelle Quellenprüfung noch offen.</strong><p>Die Frage besitzt eine individuell zugeordnete CARAT-Szene und einen Platz im zusammenhängenden Handlungsbogen. Eine fragegenaue fachliche Begründung wird erst nach Einzelprüfung in ISO, TÜV Modul 1 oder TÜV Modul 2 freigegeben.</p></div>`}${session.mode === 'audit' ? `<section class="carat-story-resolution ${isRight ? 'story-right' : 'story-correction'}"><div class="carat-story-kicker">CARAT · Tag ${question.caratChapter} · Geschichte nach der Antwort</div><h3>${isRight ? 'Die Auditspur wird bestätigt' : 'Die Auditspur korrigiert das innere Bild'}</h3><p>${esc(question.caratStory || '')}</p>${!isRight ? '<p><strong>Korrekturregel:</strong> Vergleiche die grün markierten Lösungen mit deiner Auswahl. Individuelle Begründungen stehen direkt an den Antworten, soweit sie bereits quellengeprüft hinterlegt sind.</p>' : ''}<div class="carat-memory-anchor"><strong>Gedächtnisanker:</strong> ${esc(question.caratAnchor || '')}</div><div class="carat-source-direction"><strong>${question.caratEditorialStatus === 'individually-verified' ? 'Geprüfte Fundstelle' : question.caratEditorialStatus === 'limited' ? 'Begrenzte Quellenlage' : 'Quellenrichtung – Einzelprüfung offen'}:</strong> ${esc(question.caratSourceDirection || '')}</div></section>` : ''}</div>
      </div>`;
    }

    const isExam = session.mode === 'exam';
    const flaggedNow = Boolean(session.flagged?.[questionKey]);
    const examNavigation = isExam ? `<aside class="exam-navigation" aria-label="Prüfungsnavigation">
      <div class="exam-navigation-head"><strong>Fragenübersicht</strong><span>${Object.values(session.flagged || {}).filter(Boolean).length} markiert</span></div>
      <div class="exam-navigation-grid">${session.questions.map((item, index) => {
        const key = sessionQuestionKey(item);
        const answered = (session.selections?.[key] || []).length > 0;
        const flagged = Boolean(session.flagged?.[key]);
        return `<button type="button" class="exam-nav-button ${index === session.index ? 'current' : ''} ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''}" data-action="goto-exam-question" data-index="${index}" aria-label="Frage ${index + 1}${answered ? ', beantwortet' : ''}${flagged ? ', markiert' : ''}">${index + 1}${flagged ? '<span>⚑</span>' : ''}</button>`;
      }).join('')}</div>
      <div class="exam-navigation-legend"><span><i class="answered"></i> beantwortet</span><span><i class="flagged"></i> markiert</span></div>
    </aside>` : '';
    app.innerHTML = layout(`<div class="session-wrap">
      <div class="session-head">
        <div class="session-meta">
          <span class="pill strong-pill">${esc(session.label)}</span>
          <span class="pill">${esc(question.categoryName || question.testName)}</span>
          <span class="pill">${session.mode === 'path' ? `Fortlaufend · Frage ${pathQuestionNumber}` : session.mode === 'audit' ? `CARAT Tag ${question.caratChapter} · ${session.index + 1} / ${session.questions.length}` : `${session.index + 1} / ${session.questions.length}`}</span>
          ${session.mode === 'path' && session.breakGameEnabled ? `<span class="pill">${untilBreak} bis Pause</span>` : ''}
        </div>
        ${isExam ? '<div class="timer" id="timer">0:00</div>' : ''}
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <article class="question-card">
        <div class="question-label-row"><span class="question-id">Frage ${esc(question.displayId)}</span><span class="question-origin">${question.origin === 'custom' ? 'Eigene Datenbank' : 'Originaler Fragenbestand'}</span></div>
        <h2 class="question-text">${esc(question.question)}</h2>
        <div class="instruction">Eine oder mehrere Antworten können richtig sein.</div>
        <div class="question-tools"><button class="ghost-btn compact-btn" type="button" data-action="speak-question">🔊 Frage vorlesen</button>${isExam ? `<button class="ghost-btn compact-btn ${flaggedNow ? 'flag-active' : ''}" type="button" data-action="toggle-exam-flag">⚑ ${flaggedNow ? 'Markierung entfernen' : 'Frage markieren'}</button>` : ''}</div>
        ${session.mode === 'path' ? `<aside class="learning-coach"><span>Lernbegleiter</span><p>${esc(learningCoachMessage(session))}</p></aside>` : ''}
        ${session.mode === 'audit' ? `<aside class="learning-coach audit-coach"><span>Auditorenbegleiter</span><p>${esc(auditCoachMessage(session))}</p></aside>` : ''}
        ${session.mode === 'audit' && question.caratHelp && !checked ? `<div class="carat-question-help">${caratHelpVisible ? `<div><div class="carat-story-kicker">Hilfe · Auditszene ohne Lösung</div><p>${esc(question.caratHelp)}</p></div>` : '<p>Die neutrale Originalfrage bleibt unverändert. Öffne die CARAT-Szene nur, wenn du die abstrakte Formulierung in einer betrieblichen Beobachtung sehen möchtest.</p>'}<button class="secondary-btn" data-action="show-carat-help" ${caratHelpVisible ? 'disabled' : ''}>${caratHelpVisible ? 'CARAT-Szene geöffnet' : 'Im CARAT-Audit verstehen'}</button></div>` : ''}
        ${session.mode === 'path' && question.pathHint && !checked ? `<div class="path-question-help">${hintVisible ? `<div><strong>Kapitelhilfe:</strong><p>${esc(question.pathHint)}</p></div>` : '<p>Du kannst zuerst selbst lösen oder dir nur eine Kapitelhilfe anzeigen lassen – ohne die Lösung vorwegzunehmen.</p>'}<button class="secondary-btn" data-action="show-path-hint" ${hintVisible ? 'disabled' : ''}>${hintVisible ? 'Kapitelhilfe angezeigt' : 'Kapitelhilfe anzeigen'}</button></div>` : ''}
        <div class="answers">${answers}</div>
        ${feedback}
      </article>
      ${examNavigation}
      <div class="session-actions">
        <button class="secondary-btn" data-action="prev" ${session.index === 0 ? 'disabled' : ''}>← Zurück</button>
        <div class="spacer"></div>
        ${!isExam && !checked ? '<button class="primary-btn" data-action="check">Antwort prüfen</button>' : ''}
        ${!isExam && checked ? `<button class="primary-btn" data-action="next">${session.mode === 'path' ? 'Weiterlernen →' : session.mode === 'audit' ? (session.index === session.questions.length - 1 ? 'Begehungsabschnitt abschließen' : 'Begehung fortsetzen →') : session.index === session.questions.length - 1 ? 'Lernrunde beenden' : 'Nächste Frage →'}</button>` : ''}
        ${(session.mode === 'path' || session.mode === 'audit') ? `<button class="ghost-btn" data-action="pause-path">${session.mode === 'audit' ? 'Betriebsbegehung pausieren' : 'Lernpfad pausieren'}</button>` : ''}
        ${isExam ? `<button class="secondary-btn" data-action="next" ${session.index === session.questions.length - 1 ? 'disabled' : ''}>Weiter →</button><button class="danger-btn" data-action="finish-exam">Prüfung abschließen</button>` : ''}
      </div>
    </div>`);

    if (isExam) {
      updateTimer();
      timerHandle = setInterval(updateTimer, 1000);
    }
  }

  function updateTimer() {
    const element = document.getElementById('timer');
    if (!element || !state.session) return;
    const elapsed = Math.max(0, (Date.now() - state.session.startedAt) / 1000);
    const limit = Number(state.session.timeLimitSeconds || 0);
    if (!limit) {
      element.textContent = fmtTime(elapsed);
      return;
    }
    const remaining = Math.max(0, Math.ceil(limit - elapsed));
    element.textContent = `Restzeit ${fmtTime(remaining)}`;
    element.classList.toggle('timer-warning', remaining <= 300);
    if (remaining <= 0 && !state.session.endedAt) {
      state.session.timedOut = true;
      finishExam(true);
    }
  }

  function toggleExamFlag() {
    const session = state.session;
    if (!session || session.mode !== 'exam') return;
    const question = session.questions[session.index];
    const key = sessionQuestionKey(question);
    session.flagged = session.flagged || {};
    session.flagged[key] = !session.flagged[key];
    saveActiveSession();
    render();
  }

  function toggleAnswer(index, checked) {
    const session = state.session;
    const question = session.questions[session.index];
    const key = sessionQuestionKey(question);
    if (session.checked[key]) return;
    const selected = new Set(session.selections[key] || []);
    checked ? selected.add(index) : selected.delete(index);
    session.selections[key] = [...selected];
    saveActiveSession();
  }

  function recordAttempt(question, correct) {
    const session = state.session;
    const questionKey = sessionQuestionKey(question);
    const selected = session?.selections?.[questionKey] || [];
    const expected = correctIndexes(question);
    const responseSeconds = Math.max(0, Math.round(Number(session?.questionActiveMilliseconds?.[questionKey] || 0) / 1000));
    const stats = store.stats[question.uid] || {attempts: 0, correct: 0, wrong: 0};
    stats.attempts += 1;
    if (correct) stats.correct += 1; else stats.wrong = (stats.wrong || 0) + 1;
    stats.lastAttemptAt = new Date().toISOString();
    store.stats[question.uid] = stats;
    const wrong = new Set(store.wrongIds);
    correct ? wrong.delete(question.uid) : wrong.add(question.uid);
    store.wrongIds = [...wrong];
    store.attemptLog = [...(store.attemptLog || []), {
      at: new Date().toISOString(), uid: question.uid, displayId: question.displayId,
      learningFieldId: question.categoryId || 'unbekannt', learningField: question.categoryName || question.testName || 'Unbekannt',
      mode: session?.mode || 'unknown', sessionRunId: session?.sessionRunId || null,
      correct, selectedCount: selected.length, correctCount: expected.length, responseSeconds
    }].slice(-10000);
    if (session) {
      if (correct) session.correctInSession = Number(session.correctInSession || 0) + 1;
      else session.wrongInSession = Number(session.wrongInSession || 0) + 1;
      if (session.mode === 'path' && session.pathModuleId) {
        session.pathAnsweredTotal = Number(session.pathAnsweredTotal || 0) + 1;
        const progress = store.learningPathProgress[session.pathModuleId] || {};
        const attempts = Number(progress.attempts || 0) + 1;
        const correctAnswers = Number(progress.correct || 0) + (correct ? 1 : 0);
        store.learningPathProgress[session.pathModuleId] = {
          ...progress,
          startedAt: progress.startedAt || new Date().toISOString(),
          lastAt: new Date().toISOString(),
          attempts,
          correct: correctAnswers
        };
      }
    }
    saveStore();
  }

  function checkLearning() {
    const session = state.session;
    const question = session.questions[session.index];
    const key = sessionQuestionKey(question);
    if (session.checked[key]) return;
    if (!(session.selections[key] || []).length) {
      toast('Wähle zuerst mindestens eine Antwort aus. Erst dann zählt ein Versuch.');
      return;
    }
    registerSessionActivity();
    session.checked[key] = true;
    recordAttempt(question, sameSet(selectedForQuestion(question), correctIndexes(question)));
    saveActiveSession();
    if (registerAnsweredQuestion(question)) return;
    render();
  }

  function continueLearningPath(session) {
    const module = LEARNING_PATH_MODULES.find(item => item.id === session.pathModuleId);
    const pool = module
      ? questionsForLearningModule(module)
      : (session.pathPoolUids || []).map(uid => getQuestionByUid(uid)).filter(Boolean);
    if (!pool.length) {
      toast('Für diesen Lernpfad sind keine weiteren Fragen verfügbar.');
      return;
    }
    const nextCycle = Number(session.pathCycle || 1) + 1;
    const nextQuestions = prepareQuestionsForSession('path', pool, {
      random: false,
      runId: session.sessionRunId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      cycle: nextCycle
    });
    session.questions = nextQuestions;
    session.index = 0;
    session.selections = {};
    session.checked = {};
    session.hints = {};
    session.completedUids = [];
    session.pathCycle = nextCycle;
    session.currentQuestionStartedAt = Date.now();
    resetSessionActivityClock(session);
    saveActiveSession();
    render();
    toast('Der Lernpfad läuft ohne Unterbrechung mit neu gemischten Antworten weiter.');
  }

  function nextQuestion() {
    const session = state.session;
    const current = session.questions[session.index];
    const currentKey = sessionQuestionKey(current);
    if (session.mode === 'exam' && (session.selections[currentKey] || []).length && registerAnsweredQuestion(current)) return;
    if (session.index >= session.questions.length - 1) {
      if (session.mode === 'exam') return;
      if (session.mode === 'path') {
        continueLearningPath(session);
        return;
      }
      completeLearningSession();
      state.view = 'home';
      state.session = null;
      clearActiveSession();
      render();
      toast('Lernrunde abgeschlossen und gespeichert.');
      return;
    }
    session.index += 1;
    session.currentQuestionStartedAt = Date.now();
    resetSessionActivityClock(session);
    saveActiveSession();
    render();
  }

  function prevQuestion() {
    if (state.session.index > 0) {
      state.session.index -= 1;
      state.session.currentQuestionStartedAt = Date.now();
      resetSessionActivityClock(state.session);
      saveActiveSession();
      render();
    }
  }

  function completeLearningSession() {
    const session = state.session;
    if (session?.mode === 'audit' && session.auditChapterId) {
      const answeredNow = Object.keys(session.checked || {}).length;
      const oldProgress = store.auditJourneyProgress[session.auditChapterId] || {};
      store.auditJourneyProgress[session.auditChapterId] = {...oldProgress, startedAt: oldProgress.startedAt || new Date().toISOString(), lastAt: new Date().toISOString(), completed: answeredNow >= session.questions.length};
      store.auditJourneyLastChapter = session.auditChapterId;
    }
    if (session?.mode === 'path' && session.pathModuleId) {
      const answeredNow = Object.keys(session.checked || {}).length;
      const ratio = answeredNow ? Number(session.correctInSession || 0) / answeredNow : 0;
      const oldProgress = store.learningPathProgress[session.pathModuleId] || {};
      store.learningPathProgress[session.pathModuleId] = {
        ...oldProgress,
        startedAt: oldProgress.startedAt || new Date().toISOString(),
        lastAt: new Date().toISOString(),
        completed: oldProgress.completed || (answeredNow >= 6 && ratio >= .7)
      };
      store.learningPathLastModule = session.pathModuleId;
    }
    if (!session) return;
    registerSessionActivity();
    const seconds = activeSessionSeconds(session);
    const answered = Object.keys(session.checked || {}).length;
    const right = Number(session.correctInSession || 0);
    const percent = answered ? Math.round(right / answered * 100) : 0;
    store.sessionHistory = [{
      date: new Date().toISOString(), mode: session.mode, label: session.label,
      percent, right, wrong: Number(session.wrongInSession || 0), total: answered, seconds,
      wallSeconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
      sessionRunId: session.sessionRunId || null, timeBasis: 'active-30s-idle-limit', completed: true
    }, ...(store.sessionHistory || [])].slice(0, 500);
    saveStore();
  }

  async function finishExam(auto = false) {
    const session = state.session;
    registerSessionActivity();
    const unanswered = session.questions.filter(question => (session.selections[sessionQuestionKey(question)] || []).length === 0).length;
    const flagged = Object.values(session.flagged || {}).filter(Boolean).length;
    if (!auto && (unanswered || flagged)) {
      const parts = [];
      if (unanswered) parts.push(`${unanswered} Frage(n) sind noch unbeantwortet`);
      if (flagged) parts.push(`${flagged} Frage(n) sind markiert`);
      if (!(await appConfirm(`${parts.join(' und ')}. Prüfung trotzdem abschließen?`, {title:'Prüfung abschließen?',confirmLabel:'Prüfung abschließen'}))) return;
    }
    session.questions.forEach(question => {
      const key = sessionQuestionKey(question);
      if ((session.selections[key] || []).length && !session.completedUids.includes(key)) {
        session.completedUids.push(key);
        session.breakAnsweredInSession = Number(session.breakAnsweredInSession || 0) + 1;
        store.breakAnsweredTotal = Number(store.breakAnsweredTotal || 0) + 1;
      }
    });
    saveStore();
    session.endedAt = Date.now();
    session.results = session.questions.map(question => ({
      q: question,
      selected: session.selections[sessionQuestionKey(question)] || [],
      correct: sameSet(session.selections[sessionQuestionKey(question)] || [], correctIndexes(question))
    }));
    session.results.filter(result => result.selected.length > 0).forEach(result => recordAttempt(result.q, result.correct));
    const right = session.results.filter(result => result.correct).length;
    const percent = Math.round(right / session.results.length * 100);
    const seconds = Math.round((session.endedAt - session.startedAt) / 1000);
    const activeSeconds = activeSessionSeconds(session);
    const passed = percent >= session.threshold;
    store.passThreshold = session.threshold;
    store.history = [{
      date: new Date().toISOString(), label: session.label, percent, right,
      total: session.results.length, answered: session.results.filter(result => result.selected.length > 0).length,
      seconds, activeSeconds, passed, threshold: session.threshold,
      examType: session.examType || 'custom'
    }, ...(store.history || [])].slice(0, 50);
    store.sessionHistory = [{
      date: new Date().toISOString(), mode: 'exam', label: session.label, percent, right,
      wrong: session.results.length - right, total: session.results.length, seconds: activeSeconds,
      wallSeconds: seconds, passed, sessionRunId: session.sessionRunId || null,
      timeBasis: 'active-30s-idle-limit', threshold: session.threshold, examType: session.examType || 'custom', completed: true
    }, ...(store.sessionHistory || [])].slice(0, 500);
    store.activeSession = null;
    saveStore();
    state.view = 'result';
    render();
  }

  function renderResult() {
    const session = state.session;
    const results = session.results || [];
    const right = results.filter(result => result.correct).length;
    const wrong = results.length - right;
    const percent = Math.round(right / results.length * 100);
    const seconds = Math.round((session.endedAt - session.startedAt) / 1000);
    const passed = percent >= session.threshold;

    const wrongItems = results.filter(result => !result.correct).map((result, index) => {
      const selected = result.selected;
      return `<details class="wrong-item" ${index < 2 ? 'open' : ''}>
        <summary><span>${esc(result.q.displayId)}</span>${esc(result.q.question)}</summary>
        <div class="wrong-detail">${result.q.answers.map((answer, answerIndex) => {
          const wasSelected = selected.includes(answerIndex);
          let status = '';
          if (answer.correct && wasSelected) status = '<span class="result-answer-status ok">✓ RICHTIG AUSGEWÄHLT</span>';
          else if (answer.correct) status = '<span class="result-answer-status ok">✓ RICHTIGE LÖSUNG – NICHT AUSGEWÄHLT</span>';
          else if (wasSelected) status = '<span class="result-answer-status bad">✕ FALSCH AUSGEWÄHLT</span>';
          return `<div class="answer-line">${status}<span class="${answer.correct ? 'tag-ok' : wasSelected ? 'tag-bad' : ''}">${esc(answer.text)}</span></div>`;
        }).join('')}</div>
      </details>`;
    }).join('');

    app.innerHTML = layout(`<div class="session-wrap">
      <section class="result-hero ${passed ? 'result-pass' : 'result-fail'}">
        <div class="score-ring" style="--score:${percent * 3.6}deg;--score-color:${passed ? 'var(--ok)' : 'var(--bad)'}"><strong>${percent}%</strong></div>
        <div class="eyebrow">${session.timedOut ? 'Zeit abgelaufen · automatisch abgegeben' : 'Prüfung beendet'}</div>
        <h1 class="${passed ? 'pass' : 'fail'}">${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}</h1>
        <p>Bestehensgrenze: ${session.threshold}%</p>
        <div class="result-grid">
          <div class="result-box result-correct"><strong>${right}</strong><span>RICHTIG</span></div>
          <div class="result-box result-wrong"><strong>${wrong}</strong><span>FALSCH</span></div>
          <div class="result-box"><strong>${results.length}</strong><span>gesamt</span></div>
          <div class="result-box"><strong>${fmtTime(seconds)}</strong><span>Zeit</span></div>
        </div>
        <div class="actions centered">
          <button class="primary-btn" data-action="repeat-result-wrong" ${wrong ? '' : 'disabled'}>Fehlerfragen wiederholen</button>
          <button class="secondary-btn" data-action="new-exam">Neue Prüfung</button>
          <button class="ghost-btn" data-action="home">Startseite</button>
        </div>
      </section>
      ${wrong ? `<section class="section-block"><div class="section-heading"><div><div class="eyebrow">Auswertung</div><h2>Falsch beantwortete Fragen</h2></div></div><div class="wrong-list">${wrongItems}</div></section>` : '<div class="empty success-empty">Alle Fragen wurden richtig beantwortet.</div>'}
    </div>`);
  }


  function examTypeLabel(type) {
    return ({full:'Vollprüfung', mini10:'Mini 10', mini20:'Mini 20', mini30:'Mini 30', custom:'Individuell'})[type] || 'Prüfung';
  }

  function inferExamType(item = {}) {
    if (['full','mini10','mini20','mini30','custom'].includes(item.examType || item.type)) return item.examType || item.type;
    const label = String(item.label || '').toLowerCase();
    const total = Number(item.total || 0);
    if (label.includes('mini 10') || (total === 5 && label.includes('10 minuten'))) return 'mini10';
    if (label.includes('mini 20') || (total === 10 && label.includes('20 minuten'))) return 'mini20';
    if (label.includes('mini 30') || (total === 15 && label.includes('30 minuten'))) return 'mini30';
    return total === 45 ? 'full' : 'custom';
  }

  function mergedExamHistory() {
    const central = (store.history || []).map(item => ({
      date: item.date, type: inferExamType(item), correct: Number(item.right || 0), total: Number(item.total || 0),
      pct: Number(item.percent || 0), passed: Boolean(item.passed), seconds: Number(item.seconds || 0), source: 'Lernplattform'
    }));
    const workshop = (loadWorkshopStats().exams || []).map(item => ({
      date: item.date, type: inferExamType(item), correct: Number(item.correct || 0), total: Number(item.total || 0),
      pct: Number(item.pct || 0), passed: Boolean(item.passed), seconds: Number(item.seconds || 0), source: 'frühere Lernmodule'
    }));
    return [...central, ...workshop].filter(item => item.date).sort((a,b) => new Date(a.date) - new Date(b.date));
  }

  function orphanAttemptSeconds() {
    const completedRunIds = new Set((store.sessionHistory || []).map(item => item.sessionRunId).filter(Boolean));
    const activeRunId = store.activeSession && !store.activeSession.endedAt ? store.activeSession.sessionRunId || null : null;
    return (store.attemptLog || []).reduce((sum, item) => {
      if (!item.sessionRunId || completedRunIds.has(item.sessionRunId) || item.sessionRunId === activeRunId) return sum;
      return sum + Math.max(0, Number(item.responseSeconds || 0));
    }, 0);
  }

  function mergedActivityDays() {
    const days = {};
    const legacy = loadWorkshopStats();
    const active = store.activeSession;
    const activeRunId = active && !active.endedAt ? active.sessionRunId || null : null;
    Object.entries(legacy.days || {}).forEach(([key, seconds]) => { days[key] = Number(seconds || 0); });
    const completedDayKeys = new Set();
    const completedRunIds = new Set();
    (store.sessionHistory || []).forEach(item => {
      const key = localDateKey(item.date);
      if (key) {
        completedDayKeys.add(key);
        days[key] = Number(days[key] || 0) + Number(item.seconds || 0);
      }
      if (item.sessionRunId) completedRunIds.add(item.sessionRunId);
    });
    (store.attemptLog || []).forEach(item => {
      const key = localDateKey(item.at);
      const belongsToUnfinishedRun = item.sessionRunId && !completedRunIds.has(item.sessionRunId) && item.sessionRunId !== activeRunId;
      const isLegacyUnassignedAttempt = !item.sessionRunId && !completedDayKeys.has(key);
      if (key && (belongsToUnfinishedRun || isLegacyUnassignedAttempt)) {
        days[key] = Number(days[key] || 0) + Math.max(0, Number(item.responseSeconds || 0));
      }
    });
    if (active && !active.endedAt) {
      const key = localDateKey(active.startedAt || new Date());
      if (key) days[key] = Number(days[key] || 0) + Math.max(0, Math.round(Number(active.activeMilliseconds || 0) / 1000));
    }
    return days;
  }

  function activityStreak(days) {
    let streak = 0;
    for (let offset = 0; offset < 400; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const active = Number(days[localDateKey(date)] || 0) >= 30;
      if (active) streak += 1;
      else if (offset !== 0) break;
    }
    return streak;
  }

  function filteredExamHistory(exams) {
    if (state.statsExamRange === 'all') return exams.slice(-40);
    const days = Number(state.statsExamRange || 0);
    const cutoff = Date.now() - days * 86400000;
    return exams.filter(item => new Date(item.date).getTime() >= cutoff).slice(-40);
  }

  function examProgressChart(exams) {
    const list = filteredExamHistory(exams);
    if (!list.length) return '<p class="statistics-empty">Noch keine Prüfung abgeschlossen – danach erscheint hier der Verlauf.</p>';
    const width = 720, height = 250, left = 42, right = 18, top = 18, bottom = 46;
    const x = index => left + (list.length === 1 ? (width-left-right)/2 : index*(width-left-right)/(list.length-1));
    const y = pct => height-bottom-(Math.max(0,Math.min(100,pct))/100)*(height-top-bottom);
    const grid = [0,20,40,60,80,100].map(pct => `<g><line x1="${left}" y1="${y(pct)}" x2="${width-right}" y2="${y(pct)}"></line><text x="${left-7}" y="${y(pct)+4}" text-anchor="end">${pct}</text></g>`).join('');
    const points = list.map((item,index) => `${x(index).toFixed(1)},${y(item.pct).toFixed(1)}`).join(' ');
    const dots = list.map((item,index) => `<g><circle cx="${x(index)}" cy="${y(item.pct)}" r="6" class="${item.passed?'chart-pass':'chart-fail'}"><title>${examTypeLabel(item.type)} · ${item.pct}% · ${item.correct}/${item.total}</title></circle><text x="${x(index)}" y="${height-bottom+18}" text-anchor="middle">${item.type === 'full' ? '90' : item.type === 'mini10' ? '10' : item.type === 'mini20' ? '20' : item.type === 'mini30' ? '30' : 'ind.'}</text></g>`).join('');
    return `<svg class="exam-progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prüfungsverlauf in Prozent">${grid}<polyline points="${points}" class="chart-line"></polyline>${dots}</svg><div class="chart-legend"><span><i class="pass-dot"></i> bestanden</span><span><i class="fail-dot"></i> nicht bestanden</span><span>Zahl unter dem Punkt = Prüfungsdauer</span></div>`;
  }

  function practiceCalendar(days) {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth() + Number(state.statsCalendarOffset || 0), 1);
    const year = first.getFullYear(), month = first.getMonth();
    const leading = (first.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({length: leading}, () => '<span class="calendar-day blank"></span>');
    for (let day = 1; day <= count; day += 1) {
      const date = new Date(year, month, day);
      const key = localDateKey(date);
      const seconds = Number(days[key] || 0);
      const active = seconds >= 30;
      const isToday = key === localDateKey(today);
      cells.push(`<span class="calendar-day ${active?'active':''} ${isToday?'today':''}" title="${active ? `${fmtTime(seconds)} geübt` : 'keine Aktivität'}">${active?'✓':day}</span>`);
    }
    return `<div class="calendar-head"><button class="ghost-btn compact-btn" data-action="stats-prev-month">‹</button><strong>${first.toLocaleDateString('de-DE',{month:'long',year:'numeric'})}</strong><button class="ghost-btn compact-btn" data-action="stats-next-month">›</button><button class="ghost-btn compact-btn" data-action="stats-today">Heute</button></div><div class="practice-calendar"><span class="calendar-weekday">Mo</span><span class="calendar-weekday">Di</span><span class="calendar-weekday">Mi</span><span class="calendar-weekday">Do</span><span class="calendar-weekday">Fr</span><span class="calendar-weekday">Sa</span><span class="calendar-weekday">So</span>${cells.join('')}</div>`;
  }

  function exportStatisticsCsv() {
    const exams = mergedExamHistory();
    const days = mergedActivityDays();
    const legacy = loadWorkshopStats();
    const currentSeconds = store.activeSession && !store.activeSession.endedAt ? Math.max(0, Math.round(Number(store.activeSession.activeMilliseconds || 0) / 1000)) : 0;
    const totalSeconds = (store.sessionHistory || []).reduce((sum,item) => sum + Number(item.seconds || 0), 0) + orphanAttemptSeconds() + currentSeconds + Number(legacy.practiceSeconds || 0);
    const rows = [
      ['Qualitätsmanager Lernplattform – gemeinsame Statistik', `Stand: ${new Date().toLocaleString('de-DE')}`],
      [],
      ['Lernzeit gesamt (Sekunden)', totalSeconds],
      ['Zählregel', 'Nur Bearbeitungszeit; automatische Pause nach 30 Sekunden ohne Aktivität'],
      ['Tage-Streak', activityStreak(days)],
      ['Prüfungen gesamt', exams.length],
      ['davon bestanden', exams.filter(item => item.passed).length],
      [],
      ['Prüfungsverlauf'],
      ['Datum','Typ','Richtig','Gesamt','Prozent','Ergebnis','Quelle']
    ];
    exams.forEach(item => rows.push([new Date(item.date).toLocaleString('de-DE'), examTypeLabel(item.type), item.correct, item.total, `${item.pct}%`, item.passed?'bestanden':'nicht bestanden', item.source]));
    const csv = '\ufeff' + rows.map(row => row.map(value => {
      const text = value == null ? '' : String(value);
      return /[;"\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
    }).join(';')).join('\r\n');
    const fileName = `Qualitaetsmanager_Gemeinsame_Statistik_${new Date().toISOString().slice(0,10)}.csv`;
    if (globalThis.AndroidIO && typeof globalThis.AndroidIO.saveFile === 'function') {
      globalThis.AndroidIO.saveFile(fileName, 'text/csv;charset=utf-8', btoa(unescape(encodeURIComponent(csv))));
    } else {
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    }
    toast('Gemeinsame Statistik wurde als CSV exportiert.');
  }

  async function resetMergedStatistics() {
    if (!(await appConfirm('Statistik aus allen Lernbereichen wirklich zurücksetzen? Karteikarten, Lesezeichen, eigene Fragen und Werkzeuge bleiben erhalten.', {title:'Statistik zurücksetzen?',confirmLabel:'Statistik zurücksetzen',danger:true}))) return;
    store.wrongIds = [];
    store.stats = {};
    store.history = [];
    store.attemptLog = [];
    store.sessionHistory = [];
    store.fiveDayReviewStartedAt = new Date().toISOString();
    store.fiveDayReviewLastShownAt = '';
    const legacy = loadWorkshopStats();
    legacy.practiceSeconds = 0;
    legacy.days = {};
    legacy.exams = [];
    legacy.qstat = {};
    saveWorkshopStats(legacy);
    saveStore();
    render();
    toast('Gemeinsame Statistik wurde zurückgesetzt.');
  }

  function dataCenterSwitch(activeView) {
    const statisticsActive = activeView === 'statistics';
    const catalogActive = activeView === 'catalog';
    const databaseActive = activeView === 'database';
    return `<div class="data-center-switch" role="group" aria-label="Zwischen Statistik, Fragenkatalog und Datenbank wechseln">
      <button class="data-center-switch-btn ${statisticsActive ? 'active' : ''}" type="button" data-action="statistics" aria-pressed="${statisticsActive}"><span aria-hidden="true">▥</span> Statistik ansehen</button>
      <button class="data-center-switch-btn ${catalogActive ? 'active' : ''}" type="button" data-action="catalog" aria-pressed="${catalogActive}"><span aria-hidden="true">⌕</span> Fragenkatalog</button>
      <button class="data-center-switch-btn ${databaseActive ? 'active' : ''}" type="button" data-action="database" aria-pressed="${databaseActive}"><span aria-hidden="true">▦</span> Datenbank bearbeiten</button>
    </div>`;
  }

  function renderStatistics() {
    const attempts = store.attemptLog || [];
    const sessions = store.sessionHistory || [];
    const legacy = loadWorkshopStats();
    const legacyAttempts = Object.values(legacy.qstat || {}).reduce((sum,item) => sum + Number(item?.n || 0), 0);
    const total = attempts.length + legacyAttempts;
    const correct = attempts.filter(item => item.correct).length;
    const accuracy = attempts.length ? Math.round(correct / attempts.length * 100) : 0;
    const activeSessionSecondsNow = store.activeSession && !store.activeSession.endedAt ? Math.max(0, Math.round(Number(store.activeSession.activeMilliseconds || 0) / 1000)) : 0;
    const totalSeconds = sessions.reduce((sum, item) => sum + Number(item.seconds || 0), 0) + orphanAttemptSeconds() + activeSessionSecondsNow + Number(legacy.practiceSeconds || 0);
    const activityDays = mergedActivityDays();
    const todaySeconds = Number(activityDays[localDateKey()] || 0);
    const streak = activityStreak(activityDays);
    const exams = mergedExamHistory();
    const passedExams = exams.filter(item => item.passed).length;
    const bestExam = exams.length ? Math.max(...exams.map(item => Number(item.pct || 0))) : null;
    const fieldMap = new Map();
    attempts.forEach(item => {
      const key = item.learningFieldId || item.learningField || 'unbekannt';
      const row = fieldMap.get(key) || {name: item.learningField || key, attempts: 0, correct: 0, over: 0, under: 0, exact: 0, seconds: 0};
      row.attempts += 1;
      if (item.correct) row.correct += 1;
      if (item.selectedCount > item.correctCount) row.over += 1;
      else if (item.selectedCount < item.correctCount) row.under += 1;
      else row.exact += 1;
      row.seconds += Number(item.responseSeconds || 0);
      fieldMap.set(key, row);
    });
    const fields = [...fieldMap.values()].sort((a,b) => {
      const aPct = a.attempts ? a.correct / a.attempts : 1;
      const bPct = b.attempts ? b.correct / b.attempts : 1;
      return (aPct - bPct) || ((b.attempts-b.correct) - (a.attempts-a.correct)) || a.name.localeCompare(b.name, 'de', {numeric:true});
    });
    const fieldRows = fields.map(row => {
      const pct = row.attempts ? Math.round(row.correct / row.attempts * 100) : 0;
      const avg = row.attempts ? Math.round(row.seconds / row.attempts) : 0;
      const tendency = `${row.over}× zu viele · ${row.under}× zu wenige · ${row.exact}× gleiche Anzahl`;
      return `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.attempts}</td><td>${pct}%</td><td>${row.attempts-row.correct}</td><td><strong>${row.over}</strong></td><td><strong>${row.under}</strong></td><td>${row.exact}</td><td><span class="tendency-detail">${esc(tendency)}</span></td><td>${fmtTime(avg)}</td></tr>`;
    }).join('');
    const hard = Object.entries(store.stats || {}).map(([uid, st]) => {
      const q = getQuestionByUid(uid, true);
      const questionAttempts = Number(st.attempts || 0);
      return q && questionAttempts ? {q, attempts: questionAttempts, wrong: questionAttempts - Number(st.correct || 0), pct: Math.round(Number(st.correct || 0)/questionAttempts*100)} : null;
    }).filter(Boolean).sort((a,b) => (b.wrong-a.wrong) || (a.pct-b.pct)).slice(0,10);
    const hardRows = hard.map(item => `<tr><td>${esc(item.q.displayId)}</td><td>${esc(item.q.categoryName || item.q.testName)}</td><td>${item.attempts}</td><td>${item.wrong}</td><td>${item.pct}%</td></tr>`).join('');
    const recentSessions = sessions.slice(0,20).map(item => `<tr><td>${formatDate(item.date, true)}</td><td>${esc(item.label || item.mode)}</td><td>${item.total || 0}</td><td>${Number.isFinite(item.percent) ? item.percent+'%' : '–'}</td><td>${fmtTime(item.seconds || 0)}</td></tr>`).join('');
    const recentExams = exams.slice().reverse().slice(0,12).map(item => `<div class="exam-history-row"><span>${formatDate(item.date,true)}<small>${examTypeLabel(item.type)} · ${item.source}</small></span><strong>${item.correct}/${item.total} · ${item.pct}%</strong><b class="${item.passed?'pass':'fail'}">${item.passed?'bestanden':'nicht bestanden'}</b></div>`).join('') || '<p class="statistics-empty">Noch keine Prüfung abgeschlossen.</p>';
    const types = ['full','mini10','mini20','mini30','custom'];
    const typeCards = types.map(type => {
      const list = exams.filter(item => item.type === type);
      const passed = list.filter(item => item.passed).length;
      return `<div class="exam-type-card"><strong>${examTypeLabel(type)}</strong><span>${passed}/${list.length} bestanden</span></div>`;
    }).join('');
    const active = store.activeSession;

    app.innerHTML = layout(`<div class="statistics-page">
      <section class="page-hero compact-hero"><div><div class="eyebrow">Statistik ansehen</div><h1>Daten &amp; Statistik</h1><p class="lead">Alle Lernbereiche werden hier gemeinsam ausgewertet. Ein Versuch zählt erst, wenn eine Frage tatsächlich beantwortet wurde.</p></div></section>
      ${dataCenterSwitch('statistics')}
      ${active ? `<section class="current-session-stat"><div><div class="eyebrow">Aktueller Durchgang</div><h2>${esc(active.label || 'Lernrunde')}</h2><p>${active.mode === 'path' ? `Fortlaufend · ${Number(active.pathAnsweredTotal || 0)} beantwortet` : `Position ${Math.min((active.index||0)+1, active.questions?.length||0)} von ${active.questions?.length||0}`} · ${Number(active.correctInSession||0)} richtig · ${Number(active.wrongInSession||0)} falsch · ${fmtTime(Math.round(Number(active.activeMilliseconds || 0) / 1000))} aktive Lernzeit</p></div><button class="primary-btn" data-action="resume-session">Fortsetzen</button></section>` : '<section class="current-session-stat empty-current"><strong>Aktuell ist kein unterbrochener Durchgang gespeichert.</strong></section>'}
      <section class="statistics-metrics"><div class="stat"><div class="stat-icon">Σ</div><div><strong>${total}</strong><span>Antworten gemeinsam</span></div></div><div class="stat"><div class="stat-icon">%</div><div><strong>${accuracy}%</strong><span>exakte Plattformquote</span></div></div><div class="stat"><div class="stat-icon">◷</div><div><strong>${fmtTime(totalSeconds)}</strong><span>Lernzeit gesamt</span></div></div><div class="stat"><div class="stat-icon">☀</div><div><strong>${fmtTime(todaySeconds)}</strong><span>heute geübt</span></div></div><div class="stat"><div class="stat-icon">🔥</div><div><strong>${streak}</strong><span>Tage in Folge</span></div></div><div class="stat"><div class="stat-icon">🏆</div><div><strong>${bestExam === null ? '–' : bestExam+'%'}</strong><span>beste Prüfung</span></div></div></section>
      <div class="verified-only-note"><strong>Zählregel:</strong> Lernzeit entsteht nur während der Bearbeitung. Erfolgt 30 Sekunden lang keine Aktivität, stoppt die Zeiterfassung automatisch. Beim Weiterlernen läuft sie wieder an. Ein bloß geöffneter Tab und unbeantwortete Prüfungsfragen erhöhen weder Lernzeit noch Versuchszähler.</div>
      <section class="exam-date-home statistics-date-card"><div><div class="eyebrow">Prüfungsplanung</div><h2>${store.examDate ? `Prüfung am ${new Date(`${store.examDate}T00:00:00`).toLocaleDateString('de-DE')}` : 'Prüfungstermin festlegen'}</h2><p>${exams.length} Prüfungen insgesamt · ${passedExams} bestanden</p></div><div class="statistics-date-actions"><label>Termin<input id="mainExamDate" type="date" value="${esc(store.examDate || '')}"></label><button class="secondary-btn" type="button" data-action="show-five-day-review">5-Tage-Überblick öffnen</button></div></section>
      <section class="section-block"><div class="section-heading"><div><div class="eyebrow">Prüfungsverlauf</div><h2>Vollprüfung und Miniprüfungen</h2></div><div class="stats-range-buttons">${[['all','Alle'],['30','30 Tage'],['90','90 Tage']].map(([value,label]) => `<button class="ghost-btn compact-btn ${state.statsExamRange===value?'active':''}" data-action="stats-range" data-range="${value}">${label}</button>`).join('')}</div></div>${examProgressChart(exams)}</section>
      <section class="statistics-two-column"><article class="section-block"><div class="section-heading"><div><div class="eyebrow">Übungstage</div><h2>Lernkalender</h2></div></div>${practiceCalendar(activityDays)}</article><article class="section-block"><div class="section-heading"><div><div class="eyebrow">Prüfungsarten</div><h2>Bestehensquote nach Format</h2></div></div><div class="exam-type-grid">${typeCards}</div><div class="exam-history-list">${recentExams}</div></article></section>
      <section class="section-block"><div class="section-heading"><div><div class="eyebrow">Auswertung nach Lernfeld</div><h2>Fehler und Antwortanzahl – exakt gezählt</h2><p class="section-note">Die schwierigsten Lernfelder stehen zuerst. Frühere Daten der ergänzenden Lernmodule werden bei Lernzeit, Streak und Prüfungsverlauf berücksichtigt. Da dort historische Treffer nur als letzter Fragenstand gespeichert wurden, bleibt die exakte Lernfeldquote auf den zentralen Lern- und Prüfungsmodus begrenzt.</p></div></div><div class="table-scroll"><table class="analytics-table exact-stat-table"><thead><tr><th>Lernfeld</th><th>Antworten</th><th>Trefferquote</th><th>Fehler</th><th>Zu viel</th><th>Zu wenig</th><th>Gleiche Anzahl</th><th>Exakte Häufigkeit</th><th>Ø Zeit</th></tr></thead><tbody>${fieldRows || '<tr><td colspan="9">Noch keine Daten vorhanden.</td></tr>'}</tbody></table></div></section>
      <section class="section-block"><div class="section-heading"><div><div class="eyebrow">Fehlerschwerpunkte</div><h2>Schwierigste Fragen</h2></div></div><div class="table-scroll"><table class="analytics-table"><thead><tr><th>Frage</th><th>Lernfeld</th><th>Versuche</th><th>Fehler</th><th>Quote</th></tr></thead><tbody>${hardRows || '<tr><td colspan="5">Noch keine Daten vorhanden.</td></tr>'}</tbody></table></div></section>
      <section class="section-block"><div class="section-heading"><div><div class="eyebrow">Lernverlauf</div><h2>Letzte Durchläufe der Lernplattform</h2></div></div><div class="table-scroll"><table class="analytics-table"><thead><tr><th>Datum</th><th>Durchgang</th><th>Fragen</th><th>Ergebnis</th><th>Zeit</th></tr></thead><tbody>${recentSessions || '<tr><td colspan="5">Noch keine abgeschlossenen Durchläufe.</td></tr>'}</tbody></table></div></section>
      <div class="statistics-actions"><button class="secondary-btn" data-action="export-statistics">Statistik als CSV exportieren</button><button class="danger-btn" data-action="reset-statistics">Gemeinsame Statistik zurücksetzen</button></div>
    </div>`);
  }

  function renderSettings() {
    const workshop = loadWorkshopStats();
    const account = window.QMBAccount?.getSummary?.() || {email:'',label:'Kontostatus wird geladen',detail:'',tone:'working'};
    const cardsPerRound = [10,20,30].includes(Number(workshop.cardsPerRound)) ? Number(workshop.cardsPerRound) : 20;
    const includeCustom = workshop.inclCustom !== false;
    const nightLevel = Math.max(0, Math.min(3, Number(store.nightLevel || 0)));
    const backgroundColor = normalizeBackgroundColor(store.backgroundColor);
    const backgroundChoices = BACKGROUND_PRESETS.map(option => `<button class="background-choice ${backgroundColor === option.color ? 'active' : ''}" data-action="set-background-color" data-color="${option.color}" aria-label="Hintergrund ${esc(option.label)} auswählen"><span class="background-swatch" style="--swatch:${option.color}"></span><b>${esc(option.label)}</b></button>`).join('');
    app.innerHTML = layout(`<div class="settings-page">
      <section class="page-hero compact-hero">
        <div><div class="eyebrow">Alles an einem Ort</div><h1>Einstellungen</h1><p class="lead">Darstellung, Lernsteuerung, Karteikarten und Datensicherung gelten zentral für alle Lernbereiche.</p></div>
        <div class="page-hero-badge">⚙<span>zentral verwaltet</span></div>
      </section>

      <section class="settings-grid">
        <article class="settings-panel settings-panel-wide tutorial-settings-card">
          <div class="settings-heading"><span>?</span><div><h2>Tutorial &amp; Orientierung</h2><p>Lass dir sämtliche Lern-, Prüfungs- und Verwaltungsbereiche noch einmal Schritt für Schritt zeigen.</p></div></div>
          <div class="tutorial-settings-content"><p>Die Führung öffnet die passenden Ansichten automatisch und erklärt dabei auch Konto, lokale PDFs, Datensicherung und rechtliche Hinweise.</p><button class="primary-btn" type="button" data-action="start-tutorial">Tutorial erneut starten</button></div>
        </article>

        <article class="settings-panel settings-panel-wide">
          <div class="settings-heading"><span>◐</span><div><h2>Darstellung und Lesbarkeit</h2><p>Die Auswahl wird in allen Lernbereichen übernommen.</p></div></div>
          <div class="settings-control-group"><strong>Farbdarstellung</strong><div class="settings-choice-row"><button class="secondary-btn ${store.theme !== 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="light">◆ Edelgrün</button><button class="secondary-btn ${store.theme === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark">🌙 Nachtgrün</button></div></div>
          <div class="settings-control-group background-settings">
            <div><strong>Hintergrundfarbe</strong><p class="settings-help">Wähle einen ruhigen Vorschlag oder stelle deinen eigenen Farbton ein. Die grünen Bedienflächen bleiben erhalten.</p></div>
            <div class="background-choice-grid">${backgroundChoices}</div>
            <label class="custom-background-picker"><span><strong>Eigene Farbe wählen</strong><small>Über den Farbwähler ist jeder gewünschte Hintergrund möglich.</small></span><span class="custom-background-control"><input id="customBackgroundColor" type="color" value="${backgroundColor}" aria-label="Eigene Hintergrundfarbe auswählen"><b>${backgroundColor.toUpperCase()}</b></span></label>
          </div>
          <div class="settings-toggle-list">
            <button class="settings-toggle ${store.readableFont ? 'active' : ''}" data-action="toggle-readable-font"><span><strong>Lesefreundliche Schrift</strong><small>Mehr Abstand und eine klarere Buchstabenform.</small></span><b>${store.readableFont ? 'Ein' : 'Aus'}</b></button>
            <button class="settings-toggle ${store.highContrast ? 'active' : ''}" data-action="toggle-high-contrast"><span><strong>Hoher Kontrast</strong><small>Stärkere Konturen und deutlichere Texte.</small></span><b>${store.highContrast ? 'Ein' : 'Aus'}</b></button>
          </div>
          <div class="settings-control-group"><strong>Blaulichtfilter</strong><div class="settings-choice-row">${[['0','Aus'],['1','Leicht'],['2','Mittel'],['3','Stark']].map(([value,label]) => `<button class="secondary-btn ${nightLevel === Number(value) ? 'active' : ''}" data-action="set-night-level" data-level="${value}">${label}</button>`).join('')}</div></div>
        </article>

        <article class="settings-panel">
          <div class="settings-heading"><span>☕</span><div><h2>Minispiele &amp; Lernpausen</h2><p>Voreinstellung für neue Lern- und Prüfungsrunden.</p></div></div>
          <label class="settings-check"><input id="settingsBreakEnabled" type="checkbox" ${store.breakGameEnabled ? 'checked' : ''}><span><strong>Erholungspausen anbieten</strong><small>Wahlweise nach 20 oder 50 beantworteten Fragen.</small></span></label>
          <div class="settings-control-group"><strong>Intervall</strong><div class="settings-choice-row"><button class="secondary-btn ${Number(store.breakEveryQuestions || 20) === 20 ? 'active' : ''}" data-action="set-break-interval" data-count="20">20 Fragen · empfohlen</button><button class="secondary-btn ${Number(store.breakEveryQuestions || 20) === 50 ? 'active' : ''}" data-action="set-break-interval" data-count="50">50 Fragen</button></div><p class="settings-help"><strong>Hinweis:</strong> Bei 20 Fragen bekommt das Gehirn früher eine kurze Erholung und kann neue Inhalte regelmäßiger verarbeiten.</p></div>
          <label class="settings-field">Pausendauer<select id="settingsBreakDuration">${[2,3,4,5].map(value => `<option value="${value}" ${Number(store.breakDurationMinutes || 3) === value ? 'selected' : ''}>${value} Minuten</option>`).join('')}</select></label>
        </article>

        <article class="settings-panel">
          <div class="settings-heading"><span>▤</span><div><h2>Karteikarten & Testmodus</h2><p>Vorgaben für Karteikarten und eigene Testfragen.</p></div></div>
          <div class="settings-control-group"><strong>Karten pro Lernrunde</strong><div class="settings-choice-row">${[10,20,30].map(value => `<button class="secondary-btn ${cardsPerRound === value ? 'active' : ''}" data-action="set-cards-per-round" data-count="${value}">${value} Karten</button>`).join('')}</div></div>
          <label class="settings-check"><input id="settingsIncludeCustom" type="checkbox" ${includeCustom ? 'checked' : ''}><span><strong>Eigene Fragen einbeziehen</strong><small>Im Testmodus bei „Alle Quellen gemischt“ verwenden.</small></span></label>
          <button class="ghost-btn" data-action="reset-workshop-cards">Karteikarten-Lernstand zurücksetzen</button>
        </article>

        <article class="settings-panel settings-panel-wide">
          <div class="settings-heading"><span>⇩</span><div><h2>Sicherung und Daten</h2><p>Eine gemeinsame Sicherungsdatei enthält Lernbereiche, Statistiken, Einstellungen und eigene Inhalte. Deine lokalen PDFs werden aus Datenschutz- und Größen­gründen nicht exportiert.</p></div></div>
          <div class="actions"><button class="primary-btn" data-action="export-all-data">Gesamte Sicherung herunterladen</button><button class="secondary-btn" data-action="choose-full-import">Sicherung einlesen</button><button class="secondary-btn" data-action="document-search" data-source="iso">Lokale PDFs verwalten</button><button class="secondary-btn" data-action="database">Fragendatenbank verwalten</button><input id="fullBackupImport" type="file" accept="application/json,.json" hidden></div>
          <div class="settings-danger-zone"><div><strong>Lokale Daten löschen</strong><p>Lernstände, Statistiken, Karteikarten, eigene Fragen, Einstellungen und die drei lokal hinterlegten PDF-Arbeitskopien dieses Browsers werden entfernt.</p></div><button class="danger-btn" data-action="delete-all-local-data">Alle lokalen Daten löschen</button></div>
        </article>

        <article class="settings-panel settings-panel-wide account-settings-card">
          <div class="settings-heading"><span>@</span><div><h2>Persönliches Konto und Geräte</h2><p id="accountSettingsEmail">${esc(account.email || 'Lokale Vorschau')}</p></div></div>
          <div class="account-settings-status"><span class="account-status-dot"></span><p id="accountSettingsStatus"><strong>${esc(account.label)}</strong>${account.detail ? ` · ${esc(account.detail)}` : ''}</p></div>
          <p>Dein Lernstand, deine Statistiken, Einstellungen, eigenen Fragen und QM-Werkzeuge werden lokal bearbeitet und verschlüsselt mit deinem Konto abgeglichen. Eigene ISO- und TÜV-PDFs bleiben ausschließlich auf dem jeweiligen Gerät.</p>
          <div class="actions"><button class="primary-btn" type="button" data-action="account">Konto und Geräte öffnen</button><button class="secondary-btn" type="button" data-action="account-sync">Jetzt synchronisieren</button></div>
        </article>

        <article class="settings-panel settings-panel-wide credits-panel">
          <div><div class="eyebrow">Privates Lernprojekt</div><h2>Recht &amp; Transparenz</h2><p>Impressum, Datenschutz, private Nutzungsbedingungen, Urheberrechts- und Quellenhinweise, Prüfungstrainer-Hinweis und KI-Transparenz sind ohne Personennamen zusammengeführt.</p></div>
          <button class="ghost-btn" data-action="info">Alle Hinweise ansehen</button>
        </article>
      </section>
    </div>`);
  }

  function downloadJsonFile(fileName, payload) {
    const json = JSON.stringify(payload, null, 2);
    if (globalThis.AndroidIO && typeof globalThis.AndroidIO.saveFile === 'function') {
      globalThis.AndroidIO.saveFile(fileName, 'application/json', btoa(unescape(encodeURIComponent(json))));
      return;
    }
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportAllData() {
    const auxiliaryKeys = ['iso9001_matrix_v1','iso9001_theme','iso9001_night','iso9001_dys','iso9001_hc'];
    const auxiliary = {};
    auxiliaryKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) auxiliary[key] = value;
    });
    downloadJsonFile(`Qualitaetsmanager_Gesamtsicherung_${new Date().toISOString().slice(0,10)}.json`, {
      app: 'QMB-Gesamtplattform', schemaVersion: APP_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
      main: store, workshop: loadWorkshopStats(), auxiliary
    });
    toast('Gesamte Sicherung wurde erstellt.');
  }

  async function importAllData(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.app !== 'QMB-Gesamtplattform' || !payload.main || typeof payload.main !== 'object') throw new Error('Die Datei ist keine gültige Gesamtsicherung der Qualitätsmanager Lernplattform.');
      if (!(await appConfirm('Die lokalen Daten aller Lernbereiche werden durch diese Sicherung ersetzt. Fortfahren?', {title:'Gesamtsicherung einlesen?',confirmLabel:'Sicherung einlesen',danger:true}))) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(payload.main));
      if (payload.workshop && typeof payload.workshop === 'object') localStorage.setItem('iso9001trainer_v1', JSON.stringify(payload.workshop));
      Object.entries(payload.auxiliary || {}).forEach(([key,value]) => { if (typeof value === 'string') localStorage.setItem(key, value); });
      store = loadStore();
      state.view = 'settings';
      applyDisplaySettings();
      render();
      toast('Gesamtsicherung wurde erfolgreich eingelesen.');
    } catch (error) {
      await appAlert(error.message || 'Die Sicherung konnte nicht eingelesen werden.', {title:'Import nicht möglich',symbol:'!'});
    }
  }

  function renderInfo() {
    app.innerHTML = layout(`<div class="info-page">
      <section class="page-hero compact-hero">
        <div>
          <div class="eyebrow">Privates Lernprojekt</div>
          <h1>Recht &amp; Transparenz</h1>
          <p class="lead">Sechs klar getrennte Hinweise – ohne Veröffentlichung von Personennamen.</p>
        </div>
        <div class="page-hero-badge">6<span>Bereiche</span></div>
      </section>

      <div class="legal-overview-grid">
        ${[
          ['01','Impressum','Privater Projektstatus, Zugang und noch erforderliche Anbieterangaben.','impressum'],
          ['02','Datenschutzerklärung','Kontodaten, lokale PDFs, verschlüsselter Geräteabgleich, Netlify und Betroffenenrechte.','datenschutz'],
          ['03','Private Nutzungsbedingungen','Persönliches Konto, privater Zweck, Verbot der Weitergabe und Zugangsschutz.','nutzungsbedingungen'],
          ['04','Urheberrecht & Quellen','Fremde Rechte, eigene Unterlagen, private Kopien und selbst formulierte Lernmedien.','urheberrecht'],
          ['05','Hinweis zum Prüfungstrainer','Private Übungshilfe ohne Garantie und ohne Verbindung zu einer Prüfungsstelle.','pruefungstrainer'],
          ['06','KI-Transparenz','Kennzeichnung KI-unterstützter Inhalte und keine KI-Verbindung bei normaler Nutzung.','ki-transparenz']
        ].map(([number,title,text,anchor]) => `<article class="legal-overview-card"><span>${number}</span><div><h2>${title}</h2><p>${text}</p><a class="secondary-btn" href="./rechtliches.html#${anchor}">Vollständig lesen</a></div></article>`).join('')}
      </div>
      <div class="info-card warning legal-status-note"><h2>Noch nicht die endgültige Rechtsfassung</h2><p>Die Texte verwenden wie gewünscht keine Personennamen. Für einen rechtlich vollständigen Produktivbetrieb können Identität, ladungsfähige Anschrift und direkte Kontaktmöglichkeit des Verantwortlichen erforderlich sein. Diese Angaben dürfen nicht durch einen Projektnamen ersetzt werden.</p></div>
      <div class="actions centered"><a class="primary-btn" href="./rechtliches.html">Gesamten Rechtsbereich öffnen</a><button class="secondary-btn" type="button" data-action="home">Zur Startseite</button></div>
    </div>`);
  }

  function renderCatalog() {
    app.innerHTML = layout(`<section class="page-hero compact-hero">
      <div><div class="eyebrow">Fragenkatalog · Nachschlagen</div><h1>Daten &amp; Statistik</h1><p class="lead">Durchsuche den vollständigen aktuellen Datenbestand – einschließlich deiner eigenen und bearbeiteten Fragen.</p></div>
      <div class="page-hero-badge">${getAllQuestions().length}<span>aktive Fragen</span></div>
    </section>
    ${dataCenterSwitch('catalog')}
    <section class="card catalog-card">
      <div class="catalog-toolbar">
        <div class="search-field"><span>⌕</span><input id="catalogSearch" type="search" placeholder="Frage oder Antwort durchsuchen …" value="${esc(state.catalogQuery)}"></div>
        <select id="catalogCategory">${categoryOptions(state.catalogCategory)}</select>
      </div>
      <div id="catalogResults"></div>
    </section>`);
    updateCatalogResults();
  }

  function sourceTypeLabel(value) {
    return QUESTION_SOURCE_TYPES.find(item => item.id === value)?.label || 'Quelle noch nicht zugeordnet';
  }

  function sourceStatusLabel(value) {
    return QUESTION_SOURCE_STATUSES.find(item => item.id === value)?.label || 'Prüfstatus offen';
  }

  function inferQuestionLearningChapter(question = {}) {
    const explicit = question.learningChapterId || question.learningPathModuleId || '';
    if (LEARNING_PATH_MODULES.some(module => module.id === explicit)) return explicit;
    const chapterNumber = Number(question.learningChapterNumber || question.caratChapter || 0);
    return LEARNING_PATH_MODULES.find(module => module.order === chapterNumber)?.id || '';
  }

  function inferQuestionSourceType(question = {}) {
    if (QUESTION_SOURCE_TYPES.some(item => item.id === question.sourceType)) return question.sourceType;
    const text = `${question.sourceRef || ''} ${question.caratSourceDirection || ''} ${question.sourceSheet || ''}`.toLowerCase();
    const hasIso = /\biso\b|din en/.test(text);
    const hasM1 = /modul\s*1|tüv\s*m?1|tuev\s*m?1/.test(text);
    const hasM2 = /modul\s*2|tüv\s*m?2|tuev\s*m?2/.test(text);
    if ([hasIso, hasM1, hasM2].filter(Boolean).length > 1) return 'multiple';
    if (hasIso) return 'iso';
    if (hasM1) return 'tuev-m1';
    if (hasM2) return 'tuev-m2';
    if (question.origin === 'custom' || /eigene/.test(text)) return 'own';
    return '';
  }

  function questionSourceReference(question = {}) {
    return String(question.sourceRef || question.caratSourceDirection || '').trim();
  }

  function questionSourceStatus(question = {}) {
    return QUESTION_SOURCE_STATUSES.some(item => item.id === question.sourceStatus) ? question.sourceStatus : 'open';
  }

  function updateQuestionSourceGuidance() {
    const type = document.getElementById('questionSourceType')?.value || '';
    const input = document.getElementById('questionSourceRef');
    const help = document.getElementById('questionSourceHelp');
    if (!input || !help) return;
    const guidance = {
      iso: ['z. B. DIN EN ISO 9001:2015, Abschnitt 8.4.1', 'Trage Norm, Ausgabe und Abschnitt aus deiner eigenen ISO-Unterlage ein.'],
      'tuev-m1': ['z. B. TÜV Modul 1, Kapitel 6.2, Seite 74', 'Trage Kapitel und möglichst den Seitenbereich aus deinem eigenen Modul 1 ein.'],
      'tuev-m2': ['z. B. TÜV Modul 2, Kapitel Audit, Seite 42', 'Trage Kapitel und möglichst den Seitenbereich aus deinem eigenen Modul 2 ein.'],
      multiple: ['z. B. ISO 9001, 9.2 sowie TÜV Modul 2, Kapitel Audit', 'Nenne alle verwendeten Quellen und ihre jeweiligen Fundstellen.'],
      own: ['z. B. Lehrbuch Qualitätsmanagement, Kapitel 4, Seite 86', 'Bezeichne deine eigene Unterlage so genau, dass du die Aussage später wiederfindest.']
    }[type] || ['Kapitel, Abschnitt oder Seitenbereich', 'Wähle zuerst die Art deiner Wissensquelle aus.'];
    input.placeholder = guidance[0];
    help.textContent = guidance[1];
  }

  function questionAssignmentMarkup(question, compact = false) {
    const chapter = LEARNING_PATH_MODULES.find(module => module.id === inferQuestionLearningChapter(question));
    const sourceType = inferQuestionSourceType(question);
    const sourceRef = questionSourceReference(question);
    const status = questionSourceStatus(question);
    if (!chapter && !sourceType && !sourceRef) return '';
    return `<div class="question-assignment ${compact ? 'compact' : ''}">
      ${chapter ? `<span><b>Lernkapitel ${chapter.order}</b> ${esc(chapter.title)}</span>` : ''}
      ${sourceType ? `<span><b>Quelle</b> ${esc(sourceTypeLabel(sourceType))}</span>` : ''}
      ${sourceRef ? `<span><b>Fundstelle</b> ${esc(sourceRef)}</span>` : ''}
      <span class="source-status ${esc(status)}"><b>Status</b> ${esc(sourceStatusLabel(status))}</span>
    </div>`;
  }

  function updateCatalogResults() {
    const element = document.getElementById('catalogResults');
    if (!element) return;
    const query = state.catalogQuery.trim().toLowerCase();
    const list = getAllQuestions().filter(item =>
      (state.catalogCategory === 'all' || item.categoryId === state.catalogCategory) &&
      (!query || item.question.toLowerCase().includes(query) || questionSourceReference(item).toLowerCase().includes(query) || item.answers.some(answer => answer.text.toLowerCase().includes(query)))
    );
    element.innerHTML = `<div class="catalog-count"><strong>${list.length}</strong> Treffer</div>
      <div class="catalog-list">${list.map(item => `<details class="catalog-item">
        <summary><span class="catalog-meta">${esc(item.displayId)}</span><span>${esc(item.question)}</span><span class="origin-badge ${item.origin}">${item.origin === 'custom' ? 'Eigene Frage' : item.updatedAt ? 'Bearbeitet' : 'Grundbestand'}</span></summary>
        <div class="catalog-detail">
          <div class="catalog-category">${esc(item.categoryName)}</div>
          ${questionAssignmentMarkup(item)}
          ${item.answers.map(answer => `<div class="catalog-answer ${answer.correct ? 'is-correct' : ''}">${answer.correct ? '<span class="tag-ok">✓ </span>' : ''}${esc(answer.text)}${answer.comment ? `<div class="hint">${esc(answer.comment)}</div>` : ''}</div>`).join('')}
          ${item.questionComment ? `<div class="question-note"><strong>Hinweis:</strong> ${esc(item.questionComment)}</div>` : ''}
        </div>
      </details>`).join('')}</div>`;
  }

  function blankAnswer(index = 0) {
    return {text: '', correct: index === 0, comment: ''};
  }

  function renderAnswerRow(answer, index) {
    return `<div class="answer-editor" data-answer-row>
      <div class="answer-editor-head"><span class="answer-letter">${String.fromCharCode(65 + index)}</span><label class="correct-switch"><input type="checkbox" data-field="answer-correct" ${answer.correct ? 'checked' : ''}><span>Richtige Antwort</span></label><button type="button" class="mini-danger" data-action="remove-answer" title="Antwort entfernen">×</button></div>
      <input type="text" data-field="answer-text" value="${esc(answer.text)}" placeholder="Antwortmöglichkeit eingeben" required>
      <input type="text" data-field="answer-comment" value="${esc(answer.comment || '')}" placeholder="Optionaler Hinweis zu dieser Antwort">
    </div>`;
  }

  function renderDatabase() {
    const allQuestions = getAllQuestions();
    const customCount = (store.customQuestions || []).length;
    const editedCount = Object.keys(store.overrides || {}).length;
    const archivedCount = (store.archivedIds || []).length;
    const editingQuestion = state.editingUid ? getQuestionByUid(state.editingUid, true) : null;
    const formQuestion = editingQuestion || {
      categoryId: getCategories()[0]?.id || 'test-1', categoryName: getCategories()[0]?.name || 'Test 1',
      displayId: '', question: '', questionComment: '', learningChapterId: '', sourceType: '', sourceRef: '', sourceStatus: 'open',
      answers: [blankAnswer(0), blankAnswer(1), blankAnswer(2)]
    };
    const formLearningChapterId = inferQuestionLearningChapter(formQuestion);
    const formSourceType = inferQuestionSourceType(formQuestion);
    const formSourceRef = questionSourceReference(formQuestion);
    const formSourceStatus = questionSourceStatus(formQuestion);

    app.innerHTML = layout(`
      <section class="page-hero database-hero">
        <div>
          <div class="eyebrow"><span class="status-dot"></span> Datenbank bearbeiten</div>
          <h1>Daten &amp; Statistik</h1>
          <p class="lead">Neue Fragen und Änderungen werden lokal gespeichert und sofort in allen Bereichen der App verwendet. Mit Sicherung und Import kannst du den Datenbestand übertragen.</p>
        </div>
        <div class="database-health">
          <div class="health-ring"><strong>${allQuestions.length}</strong><span>aktiv</span></div>
          <div><strong>Letzte Änderung</strong><span>${esc(formatDate(store.databaseUpdatedAt, true))}</span></div>
        </div>
      </section>

      ${dataCenterSwitch('database')}

      <section class="db-stats">
        <div class="db-stat"><span>Grundbestand</span><strong>${BASE_QUESTIONS.length}</strong></div>
        <div class="db-stat"><span>Eigene Fragen</span><strong>${customCount}</strong></div>
        <div class="db-stat"><span>Bearbeitete Fragen</span><strong>${editedCount}</strong></div>
        <div class="db-stat"><span>Kategorien</span><strong>${getCategories().length}</strong></div>
      </section>

      <section class="database-layout">
        <article class="card editor-card">
          <div class="section-heading compact-heading"><div><div class="eyebrow">${editingQuestion ? 'Frage aktualisieren' : 'Datenbank erweitern'}</div><h2>${editingQuestion ? 'Frage bearbeiten' : 'Neue Frage anlegen'}</h2></div>${editingQuestion ? '<button class="ghost-btn" data-action="cancel-edit">Abbrechen</button>' : ''}</div>
          <form id="questionForm" novalidate>
            <input type="hidden" id="editingUid" value="${esc(editingQuestion?.uid || '')}">
            <div class="form-grid two-col">
              <div class="field"><label for="questionCategory">Kategorie</label><select id="questionCategory">${categoryOptions(formQuestion.categoryId, true).replace('<option value="all"', '<option value="all" disabled')}</select></div>
              <div class="field"><label for="questionDisplayId">Fragenkennung</label><input id="questionDisplayId" type="text" value="${esc(formQuestion.displayId || '')}" placeholder="z. B. 3.46 oder Eigene 1"></div>
            </div>
            <div class="field new-category-field ${formQuestion.categoryId === '__new__' ? '' : 'hidden'}" id="newCategoryWrap"><label for="newCategoryName">Name der neuen Kategorie</label><input id="newCategoryName" type="text" placeholder="z. B. Interne Audits"></div>
            <section class="question-source-editor" aria-labelledby="questionSourceTitle">
              <div class="question-source-heading"><span>1</span><div><strong id="questionSourceTitle">Fachliche Zuordnung</strong><small>Ordne die Frage einem Lernkapitel und deiner eigenen Wissensquelle zu. Diese Angaben sind Pflicht.</small></div></div>
              <div class="form-grid two-col">
                <div class="field"><label for="questionLearningChapter">Lernkapitel</label><select id="questionLearningChapter" required><option value="">Bitte Lernkapitel wählen</option>${LEARNING_PATH_MODULES.map(module => `<option value="${esc(module.id)}" ${formLearningChapterId === module.id ? 'selected' : ''}>${module.order}. ${esc(module.title)}</option>`).join('')}</select></div>
                <div class="field"><label for="questionSourceType">Art der Wissensquelle</label><select id="questionSourceType" required><option value="">Bitte Quelle wählen</option>${QUESTION_SOURCE_TYPES.map(item => `<option value="${esc(item.id)}" ${formSourceType === item.id ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></div>
                <div class="field"><label for="questionSourceRef">Genaue Fundstelle</label><input id="questionSourceRef" type="text" value="${esc(formSourceRef)}" placeholder="z. B. DIN EN ISO 9001:2015, Abschnitt 8.4.1" aria-describedby="questionSourceHelp" required><small id="questionSourceHelp">Trage Kapitel, Abschnitt oder Seitenbereich aus deiner eigenen Unterlage ein.</small></div>
                <div class="field"><label for="questionSourceStatus">Prüfstatus</label><select id="questionSourceStatus" required>${QUESTION_SOURCE_STATUSES.map(item => `<option value="${esc(item.id)}" ${formSourceStatus === item.id ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select><small>Nur als „geprüft“ markieren, wenn du die Aussage selbst mit der Quelle abgeglichen hast.</small></div>
              </div>
            </section>
            <div class="question-source-heading question-content-heading"><span>2</span><div><strong>Frage und Antworten</strong><small>Formuliere den Lernstoff eigenständig und eindeutig.</small></div></div>
            <div class="field"><label for="questionText">Frage</label><textarea id="questionText" rows="4" placeholder="Frage vollständig eingeben" required>${esc(formQuestion.question || '')}</textarea></div>
            <div class="field"><label for="questionComment">Erklärung oder allgemeiner Hinweis <span>optional</span></label><textarea id="questionComment" rows="2" placeholder="Zusätzliche Erläuterung zur Lösung">${esc(formQuestion.questionComment || '')}</textarea></div>
            <div class="answer-editor-section">
              <div class="answer-section-title"><div><strong>Antwortmöglichkeiten</strong><span>Mindestens zwei Antworten und mindestens eine richtige Antwort</span></div><button type="button" class="secondary-btn small" data-action="add-answer">＋ Antwort hinzufügen</button></div>
              <div id="answerEditorList">${formQuestion.answers.map(renderAnswerRow).join('')}</div>
            </div>
            <div class="form-message" id="formMessage" hidden></div>
            <div class="actions"><button type="submit" class="primary-btn">${editingQuestion ? 'Änderungen speichern' : 'Frage zur Datenbank hinzufügen'}</button>${editingQuestion?.origin === 'base' ? '<span class="hint inline-hint">Die Originalfrage bleibt als Grundlage erhalten; gespeichert wird eine aktualisierte Version.</span>' : ''}</div>
          </form>
        </article>

        <aside class="database-tools">
          <article class="tool-card">
            <div class="tool-icon">⇩</div><div><h3>Datenbank sichern</h3><p>Eigene Fragen, Bearbeitungen und Kategorien als JSON-Datei exportieren.</p></div>
            <button class="secondary-btn full-btn" data-action="export-database">Sicherung exportieren</button>
          </article>
          <article class="tool-card">
            <div class="tool-icon">⇧</div><div><h3>Sicherung importieren</h3><p>Eine zuvor exportierte Datenbank zusammenführen oder ersetzen.</p></div>
            <select id="importMode"><option value="merge">Mit Datenbestand zusammenführen</option><option value="replace">Eigene Datenbank ersetzen</option></select>
            <button class="secondary-btn full-btn" data-action="choose-import">JSON-Datei auswählen</button>
            <input id="databaseImport" type="file" accept="application/json,.json" hidden>
          </article>
          <article class="tool-card safety-card">
            <div class="tool-icon">i</div><div><h3>Wichtig zur Speicherung</h3><p>Die Daten liegen auf diesem Gerät in diesem Browser. Für Gerätewechsel oder als Schutz vor Datenverlust regelmäßig exportieren.</p></div>
          </article>
          ${archivedCount ? `<article class="tool-card"><div class="tool-icon">↺</div><div><h3>${archivedCount} ausgeblendete Frage(n)</h3><p>Ausgeblendete Fragen wieder in die aktive Datenbank aufnehmen.</p></div><button class="ghost-btn full-btn" data-action="restore-archived">Alle wiederherstellen</button></article>` : ''}
        </aside>
      </section>

      <section class="section-block manager-section">
        <div class="section-heading"><div><div class="eyebrow">Verwalten</div><h2>Aktueller Fragenbestand</h2><p>${allQuestions.length} aktive Fragen; Wiederholungen werden nicht entfernt.</p></div></div>
        <div class="manager-toolbar">
          <div class="search-field"><span>⌕</span><input id="managerSearch" type="search" placeholder="Frage suchen …" value="${esc(state.managerQuery)}"></div>
          <select id="managerCategory">${categoryOptions(state.managerCategory)}</select>
          <select id="managerOrigin"><option value="all" ${state.managerOrigin === 'all' ? 'selected' : ''}>Alle Quellen</option><option value="custom" ${state.managerOrigin === 'custom' ? 'selected' : ''}>Eigene Fragen</option><option value="edited" ${state.managerOrigin === 'edited' ? 'selected' : ''}>Bearbeitete Originalfragen</option><option value="base" ${state.managerOrigin === 'base' ? 'selected' : ''}>Unveränderter Grundbestand</option></select>
        </div>
        <div id="managerResults"></div>
      </section>
    `);
    updateQuestionSourceGuidance();
    updateManagerResults();
  }

  function updateManagerResults() {
    const element = document.getElementById('managerResults');
    if (!element) return;
    const query = state.managerQuery.trim().toLowerCase();
    const list = getAllQuestions().filter(question => {
      const originMatches = state.managerOrigin === 'all' ||
        (state.managerOrigin === 'custom' && question.origin === 'custom') ||
        (state.managerOrigin === 'edited' && question.origin === 'base' && Boolean(question.updatedAt)) ||
        (state.managerOrigin === 'base' && question.origin === 'base' && !question.updatedAt);
      return originMatches &&
        (state.managerCategory === 'all' || question.categoryId === state.managerCategory) &&
        (!query || question.question.toLowerCase().includes(query) || question.displayId.toLowerCase().includes(query) || questionSourceReference(question).toLowerCase().includes(query));
    });

    element.innerHTML = `<div class="manager-count"><strong>${list.length}</strong> Fragen in der Auswahl</div>
      <div class="manager-list">${list.slice(0, 300).map(question => `<article class="manager-item">
        <div class="manager-question">
          <div class="manager-meta"><span>${esc(question.displayId)}</span><span>${esc(question.categoryName)}</span><span class="origin-badge ${question.origin}">${question.origin === 'custom' ? 'Eigene Frage' : question.updatedAt ? 'Bearbeitet' : 'Grundbestand'}</span></div>
          <h3>${esc(question.question)}</h3>
          <p>${question.answers.length} Antwortmöglichkeiten · ${correctIndexes(question).length} richtige Antwort(en)</p>
          ${questionAssignmentMarkup(question, true)}
        </div>
        <div class="manager-actions">
          <button class="secondary-btn small" data-action="edit-question" data-uid="${esc(question.uid)}">Bearbeiten</button>
          <button class="ghost-btn small" data-action="archive-question" data-uid="${esc(question.uid)}">${question.origin === 'custom' ? 'Löschen' : 'Ausblenden'}</button>
        </div>
      </article>`).join('')}</div>
      ${list.length > 300 ? '<div class="hint list-limit">Aus Leistungsgründen werden die ersten 300 Treffer angezeigt. Nutze Suche oder Filter für eine genauere Auswahl.</div>' : ''}`;
  }

  function addAnswerEditor(answer = blankAnswer()) {
    const list = document.getElementById('answerEditorList');
    if (!list) return;
    const index = list.querySelectorAll('[data-answer-row]').length;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderAnswerRow(answer, index);
    list.appendChild(wrapper.firstElementChild);
    renumberAnswerEditors();
  }

  function renumberAnswerEditors() {
    document.querySelectorAll('#answerEditorList [data-answer-row]').forEach((row, index) => {
      const letter = row.querySelector('.answer-letter');
      if (letter) letter.textContent = String.fromCharCode(65 + index);
    });
  }

  function collectQuestionForm() {
    const categorySelect = document.getElementById('questionCategory');
    let categoryId = categorySelect.value;
    let categoryName = '';
    let newCategory = null;
    if (categoryId === '__new__') {
      categoryName = document.getElementById('newCategoryName').value.trim();
      if (!categoryName) throw new Error('Bitte einen Namen für die neue Kategorie eingeben.');
      categoryId = slugify(categoryName);
      newCategory = {id: categoryId, name: categoryName, createdAt: new Date().toISOString()};
    } else {
      const category = getCategories().find(item => item.id === categoryId);
      categoryName = category?.name || 'Eigene Fragen';
    }

    const learningChapterId = document.getElementById('questionLearningChapter').value;
    const learningChapter = LEARNING_PATH_MODULES.find(module => module.id === learningChapterId);
    if (!learningChapter) throw new Error('Bitte ein Lernkapitel für die Frage auswählen.');

    const sourceType = document.getElementById('questionSourceType').value;
    if (!QUESTION_SOURCE_TYPES.some(item => item.id === sourceType)) throw new Error('Bitte die Art deiner Wissensquelle auswählen.');

    const sourceRef = document.getElementById('questionSourceRef').value.trim();
    if (!sourceRef) throw new Error('Bitte die genaue Fundstelle aus deiner Wissensquelle eintragen.');

    const sourceStatus = document.getElementById('questionSourceStatus').value;
    if (!QUESTION_SOURCE_STATUSES.some(item => item.id === sourceStatus)) throw new Error('Bitte einen gültigen Prüfstatus auswählen.');

    const questionText = document.getElementById('questionText').value.trim();
    if (!questionText) throw new Error('Bitte einen Fragetext eingeben.');

    const answers = [...document.querySelectorAll('#answerEditorList [data-answer-row]')].map(row => ({
      text: row.querySelector('[data-field="answer-text"]').value.trim(),
      correct: row.querySelector('[data-field="answer-correct"]').checked,
      comment: row.querySelector('[data-field="answer-comment"]').value.trim()
    })).filter(answer => answer.text);

    if (answers.length < 2) throw new Error('Bitte mindestens zwei Antwortmöglichkeiten eingeben.');
    if (!answers.some(answer => answer.correct)) throw new Error('Bitte mindestens eine Antwort als richtig markieren.');

    return {
      categoryId,
      categoryName,
      displayId: document.getElementById('questionDisplayId').value.trim() || nextDisplayId(categoryId, categoryName),
      question: questionText,
      questionComment: document.getElementById('questionComment').value.trim(),
      learningChapterId: learningChapter.id,
      learningChapterNumber: learningChapter.order,
      learningChapterTitle: learningChapter.title,
      sourceType,
      sourceRef,
      sourceStatus,
      answers,
      newCategory
    };
  }

  function nextDisplayId(categoryId, categoryName) {
    const questions = getAllQuestions().filter(question => question.categoryId === categoryId);
    const testMatch = categoryId.match(/^test-(\d+)$/);
    if (testMatch) {
      const testNumber = Number(testMatch[1]);
      const numbers = questions.map(question => {
        const match = String(question.displayId).match(/^(\d+)\.(\d+)$/);
        return match && Number(match[1]) === testNumber ? Number(match[2]) : 0;
      });
      return `${testNumber}.${Math.max(0, ...numbers) + 1}`;
    }
    return `${categoryName} ${questions.length + 1}`;
  }

  function saveQuestionFromForm(event) {
    event.preventDefault();
    const message = document.getElementById('formMessage');
    try {
      const data = collectQuestionForm();
      const editingUid = document.getElementById('editingUid').value;
      const now = new Date().toISOString();
      if (data.newCategory) store.customCategories.push(data.newCategory);
      delete data.newCategory;

      if (editingUid) {
        const existing = getQuestionByUid(editingUid, true);
        if (!existing) throw new Error('Die zu bearbeitende Frage wurde nicht gefunden.');
        if (existing.origin === 'custom') {
          const index = store.customQuestions.findIndex(question => question.uid === editingUid);
          store.customQuestions[index] = {...store.customQuestions[index], ...data, updatedAt: now};
        } else {
          store.overrides[editingUid] = {...data, updatedAt: now};
        }
        toast('Frage wurde aktualisiert.');
      } else {
        const uid = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        store.customQuestions.push({
          ...data, uid, originalId: data.displayId, sourceSheet: 'Eigene Fragendatenbank',
          sourceRow: null, createdAt: now, updatedAt: now
        });
        toast('Neue Frage wurde zur Datenbank hinzugefügt.');
      }
      state.editingUid = null;
      touchDatabase();
      render();
    } catch (error) {
      message.hidden = false;
      message.textContent = error.message || 'Die Frage konnte nicht gespeichert werden.';
      message.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }

  function editQuestion(uid) {
    state.editingUid = uid;
    state.view = 'database';
    render();
    setTimeout(() => document.getElementById('questionForm')?.scrollIntoView({behavior: 'smooth', block: 'start'}), 50);
  }

  async function archiveQuestion(uid) {
    const question = getQuestionByUid(uid);
    if (!question) return;
    if (question.origin === 'custom') {
      if (!(await appConfirm('Diese selbst angelegte Frage wirklich dauerhaft löschen?', {title:'Eigene Frage löschen?',confirmLabel:'Frage löschen',danger:true}))) return;
      store.customQuestions = store.customQuestions.filter(item => item.uid !== uid);
      delete store.stats[uid];
      store.wrongIds = store.wrongIds.filter(id => id !== uid);
      toast('Eigene Frage wurde gelöscht.');
    } else {
      if (!(await appConfirm('Diese Originalfrage aus Lernmodus, Prüfung und Katalog ausblenden? Sie kann später wiederhergestellt werden.', {title:'Originalfrage ausblenden?',confirmLabel:'Frage ausblenden'}))) return;
      store.archivedIds = [...new Set([...(store.archivedIds || []), uid])];
      store.wrongIds = store.wrongIds.filter(id => id !== uid);
      toast('Originalfrage wurde ausgeblendet.');
    }
    if (state.editingUid === uid) state.editingUid = null;
    touchDatabase();
    render();
  }

  async function restoreArchived() {
    if (!(store.archivedIds || []).length) return;
    if (!(await appConfirm('Alle ausgeblendeten Fragen wieder aktivieren?', {title:'Fragen wiederherstellen?',confirmLabel:'Alle aktivieren'}))) return;
    store.archivedIds = [];
    touchDatabase();
    render();
    toast('Ausgeblendete Fragen wurden wiederhergestellt.');
  }

  function exportDatabase() {
    const payload = {
      app: 'QMB Prüfungstrainer',
      schemaVersion: APP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      baseQuestionCount: BASE_QUESTIONS.length,
      database: {
        customCategories: store.customCategories || [],
        customQuestions: store.customQuestions || [],
        overrides: store.overrides || {},
        archivedIds: store.archivedIds || [],
        databaseUpdatedAt: store.databaseUpdatedAt
      }
    };
    const json = JSON.stringify(payload, null, 2);
    const fileName = `Qualitaetsmanager_Lernplattform_Datenbank_${new Date().toISOString().slice(0, 10)}.json`;
    if (globalThis.AndroidIO && typeof globalThis.AndroidIO.saveFile === 'function') {
      globalThis.AndroidIO.saveFile(fileName, 'application/json', btoa(unescape(encodeURIComponent(json))));
      toast('Datenbanksicherung wurde für Android bereitgestellt.');
      return;
    }
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast('Datenbanksicherung wurde erstellt.');
  }

  function mergeById(existing, incoming, idField = 'id') {
    const map = new Map(existing.map(item => [item[idField], item]));
    incoming.forEach(item => { if (item?.[idField]) map.set(item[idField], item); });
    return [...map.values()];
  }

  async function importDatabase(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const database = payload.database || payload;
      if (!database || !Array.isArray(database.customQuestions) || typeof database.overrides !== 'object') {
        throw new Error('Die Datei ist keine gültige Datensicherung der Qualitätsmanager Lernplattform.');
      }
      const mode = document.getElementById('importMode')?.value || 'merge';
      if (mode === 'replace') {
        if (!(await appConfirm('Die aktuell selbst angelegten Fragen, Bearbeitungen und Kategorien werden ersetzt. Fortfahren?', {title:'Datenbank ersetzen?',confirmLabel:'Datenbank ersetzen',danger:true}))) return;
        store.customCategories = Array.isArray(database.customCategories) ? database.customCategories : [];
        store.customQuestions = database.customQuestions;
        store.overrides = database.overrides || {};
        store.archivedIds = Array.isArray(database.archivedIds) ? database.archivedIds : [];
      } else {
        store.customCategories = mergeById(store.customCategories || [], database.customCategories || [], 'id');
        store.customQuestions = mergeById(store.customQuestions || [], database.customQuestions || [], 'uid');
        store.overrides = {...(store.overrides || {}), ...(database.overrides || {})};
        store.archivedIds = [...new Set([...(store.archivedIds || []), ...(database.archivedIds || [])])];
      }
      state.editingUid = null;
      touchDatabase();
      render();
      toast('Datenbank wurde erfolgreich importiert.');
    } catch (error) {
      await appAlert(error.message || 'Die Datenbank konnte nicht importiert werden.', {title:'Import nicht möglich',symbol:'!'});
    }
  }

  function toast(message) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const element = document.createElement('div');
    element.className = 'toast';
    element.innerHTML = `<span>✓</span>${esc(message)}`;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 3000);
  }


  async function deleteAllLocalData() {
    const accepted = await appConfirm('Wirklich sämtliche lokal gespeicherten Daten aller Lernbereiche löschen? Dazu gehören Lernstand, Statistik, Karteikarten, eigene Fragen, Kategorien, Einstellungen und die hinterlegten PDF-Arbeitskopien. Die Original-PDFs auf deinem Gerät bleiben unverändert. PDFs sind nicht Bestandteil der JSON-Sicherung.', {title:'Alle lokalen Daten löschen?',confirmLabel:'Endgültig löschen',danger:true});
    if (!accepted) return;
    await clearLocalDocuments();
    [STORE_KEY,'iso9001trainer_v1','iso9001_matrix_v1','iso9001_theme','iso9001_night','iso9001_dys','iso9001_hc'].forEach(key => localStorage.removeItem(key));
    store = {...defaultStore};
    state = {
      view: 'home',
      session: null,
      catalogQuery: '',
      catalogCategory: 'all',
      managerQuery: '',
      managerCategory: 'all',
      managerOrigin: 'all',
      editingUid: null,
      breakPrompt: null,
      game: null,
      pendingSession: null,
      openBookSource: null,
      openBookIndex: 0,
      openBookFeedback: null,
      openBookStartedAt: null,
      openBookHelpVisible: false,
      openBookDifficulty: 'easy',
      documentSearchSource: 'iso',
      statsExamRange: 'all',
      statsCalendarOffset: 0,
      tutorialActive: false,
      tutorialStep: 0
    };
    applyDisplaySettings();
    render();
    toast('Alle lokalen App-Daten wurden gelöscht.');
  }

  async function resetProgress() {
    if (!(await appConfirm('Lernstand, Fehlerliste und Prüfungshistorie wirklich löschen? Die Fragendatenbank bleibt erhalten.', {title:'Lernstand zurücksetzen?',confirmLabel:'Lernstand zurücksetzen',danger:true}))) return;
    store.wrongIds = [];
    store.stats = {};
    store.history = [];
    store.attemptLog = [];
    store.sessionHistory = [];
    store.activeSession = null;
    store.fiveDayReviewStartedAt = new Date().toISOString();
    store.fiveDayReviewLastShownAt = '';
    store.learningPathProgress = {};
    store.auditJourneyProgress = {};
    store.auditJourneyLastChapter = null;
    store.auditHelpUsage = {};
    store.openBookProgress = {};
    store.openBookHistory = [];
    store.learningPathLastModule = null;
    saveStore();
    render();
    toast('Lernstand wurde zurückgesetzt.');
  }

  document.addEventListener('submit', event => {
    registerSessionActivity();
    if (event.target.id === 'openBookForm') { event.preventDefault(); checkOpenBookAnswer(document.getElementById('openBookAnswer')?.value || ''); return; }
    if (event.target.id === 'questionForm') saveQuestionFromForm(event);
  });

  document.addEventListener('change', async event => {
    registerSessionActivity();
    if (event.target.matches('[data-local-document-input]')) {
      const input = event.target;
      const file = input.files?.[0];
      if (file) await handleLocalDocumentSelection(input.dataset.localDocumentInput, file);
      input.value = '';
      return;
    }
    if (event.target.matches('[data-answer]')) toggleAnswer(Number(event.target.dataset.answer), event.target.checked);
    if (event.target.id === 'examCategory') {
      const pool = poolFor(event.target.value);
      const input = document.getElementById('examCount');
      const preset = EXAM_PRESETS[document.getElementById('examPreset')?.value];
      input.max = pool.length;
      input.value = Math.min(preset?.count || Number(input.value) || 45, pool.length);
    }
    if (event.target.id === 'examPreset') {
      const preset = EXAM_PRESETS[event.target.value];
      if (preset) {
        const max = Number(document.getElementById('examCount')?.max || BASE_QUESTIONS.length);
        document.getElementById('examCount').value = Math.min(preset.count, max);
        document.getElementById('examMinutes').value = preset.minutes;
        document.getElementById('passThreshold').value = preset.threshold || Math.max(1, Math.min(Number(store.passThreshold) || 70, 100));
      }
    }
    if (event.target.id === 'catalogCategory') {
      state.catalogCategory = event.target.value;
      updateCatalogResults();
    }
    if (event.target.id === 'managerCategory') {
      state.managerCategory = event.target.value;
      updateManagerResults();
    }
    if (event.target.id === 'managerOrigin') {
      state.managerOrigin = event.target.value;
      updateManagerResults();
    }
    if (event.target.id === 'questionCategory') {
      const wrap = document.getElementById('newCategoryWrap');
      wrap?.classList.toggle('hidden', event.target.value !== '__new__');
    }
    if (event.target.id === 'questionSourceType') updateQuestionSourceGuidance();
    if (event.target.id === 'breakGameEnabled') {
      store.breakGameEnabled = event.target.checked;
      saveStore();
      render();
      toast(store.breakGameEnabled ? 'Minispiel-Pause eingeschaltet.' : 'Minispiel-Pause ausgeschaltet.');
    }
    if (event.target.id === 'settingsBreakEnabled') {
      store.breakGameEnabled = event.target.checked;
      saveStore();
      toast(store.breakGameEnabled ? 'Erholungspausen sind voreingestellt.' : 'Erholungspausen sind standardmäßig ausgeschaltet.');
    }
    if (event.target.id === 'settingsBreakDuration') {
      store.breakDurationMinutes = Math.max(2, Math.min(5, Number(event.target.value) || 3));
      saveStore();
      toast(`Pausendauer: ${store.breakDurationMinutes} Minuten.`);
    }
    if (event.target.id === 'settingsIncludeCustom') {
      const workshop = loadWorkshopStats();
      workshop.inclCustom = event.target.checked;
      saveWorkshopStats(workshop);
      toast(event.target.checked ? 'Eigene Fragen werden im Testmodus einbezogen.' : 'Eigene Fragen bleiben im Testmodus getrennt.');
    }
    if (event.target.id === 'customBackgroundColor') setBackgroundColor(event.target.value);
    if (event.target.id === 'databaseImport') importDatabase(event.target.files?.[0]);
    if (event.target.id === 'fullBackupImport') importAllData(event.target.files?.[0]);
    if (event.target.id === 'openBookConfidence') { const q=currentOpenBookQuestion(); if(q){ const old=store.openBookProgress[q.id]||{}; store.openBookProgress[q.id]={...old,confidence:event.target.value}; saveStore(); } }
    if (event.target.id === 'mainExamDate') {
      store.examDate = event.target.value || '';
      saveStore();
      render();
      toast(store.examDate ? 'Prüfungstermin wurde gespeichert.' : 'Prüfungstermin wurde gelöscht.');
    }
    if (event.target.id === 'dailyQuestionGoal') {
      const goal = Number(event.target.value);
      store.dailyQuestionGoal = [5,10,20,30,50].includes(goal) ? goal : 20;
      saveStore();
      render();
      toast(`Dein Tagesziel: ${store.dailyQuestionGoal} Fragen.`);
    }

  });

  document.addEventListener('input', event => {
    registerSessionActivity();
    if (event.target.id === 'videoGuideSeek') {
      seekVideoGuide(event.target.value);
      return;
    }
    if (event.target.id === 'catalogSearch') {
      state.catalogQuery = event.target.value;
      updateCatalogResults();
    }
    if (event.target.id === 'openBookTransfer') { const q=currentOpenBookQuestion(); if(q){store.openBookReflections[q.id]=event.target.value; saveStore();} }
    if (event.target.id === 'managerSearch') {
      state.managerQuery = event.target.value;
      updateManagerResults();
    }
  });

  document.addEventListener('click', async event => {
    registerSessionActivity();
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const fromQuickMenu = Boolean(button.closest('#quickMenu'));
    if (fromQuickMenu && action !== 'close-quick-menu') closeQuickMenu();

    if (action === 'tutorial-next') {
      moveTutorial(1);
    } else if (action === 'tutorial-back') {
      moveTutorial(-1);
    } else if (action === 'tutorial-skip') {
      finishTutorial(true);
    } else if (action === 'start-tutorial') {
      startTutorial(true);
    } else if (action === 'quick-menu') {
      openQuickMenu();
    } else if (action === 'close-quick-menu') {
      closeQuickMenu();
    } else if (action === 'video-guides') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      pauseVideoGuide();
      state.videoGuideReturnView = state.view === 'learningPath' ? 'learningPath' : 'videoGuides';
      state.videoGuideElapsed = 0;
      state.videoGuideScene = 0;
      state.view = 'videoGuides';
      render();
    } else if (action === 'path-video') {
      const guide = PUBLISHED_VIDEO_GUIDES.find(item => item.id === button.dataset.videoId);
      if (!guide) return;
      pauseVideoGuide();
      state.videoGuideId = guide.id;
      state.videoGuideElapsed = 0;
      state.videoGuideScene = 0;
      state.videoGuideReturnView = 'learningPath';
      state.view = 'videoGuides';
      render();
    } else if (action === 'select-video-guide') {
      const guide = PUBLISHED_VIDEO_GUIDES.find(item => item.id === button.dataset.videoId);
      if (!guide) return;
      pauseVideoGuide();
      state.videoGuideId = guide.id;
      state.videoGuideElapsed = 0;
      state.videoGuideScene = 0;
      render();
    } else if (action === 'video-next-guide') {
      const currentIndex = PUBLISHED_VIDEO_GUIDES.findIndex(item => item.id === currentVideoGuide().id);
      const nextGuide = PUBLISHED_VIDEO_GUIDES[currentIndex + 1];
      if (!nextGuide) return;
      pauseVideoGuide();
      state.videoGuideId = nextGuide.id;
      state.videoGuideElapsed = 0;
      state.videoGuideScene = 0;
      render();
    } else if (action === 'video-return') {
      pauseVideoGuide();
      state.view = state.videoGuideReturnView === 'learningPath' ? 'learningPath' : 'videoGuides';
      render();
    } else if (action === 'video-play') {
      startVideoGuide();
    } else if (action === 'video-pause') {
      pauseVideoGuide();
    } else if (action === 'video-restart') {
      pauseVideoGuide();
      state.videoGuideElapsed = 0;
      showVideoScene(0, false);
    } else if (action === 'video-voice') {
      state.videoGuideVoice = !state.videoGuideVoice;
      if (!state.videoGuideVoice && globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
      const voiceButton = document.getElementById('videoVoiceButton');
      if (voiceButton) {
        voiceButton.classList.toggle('active', state.videoGuideVoice);
        voiceButton.setAttribute('aria-pressed', String(state.videoGuideVoice));
        voiceButton.textContent = state.videoGuideVoice ? '🔊 Stimme an' : '🔇 Stimme aus';
      }
      if (state.videoGuideVoice && state.videoGuidePlaying) speakVideoScene(state.videoGuideScene);
    } else if (action === 'install-help') {
      openInstallHelp();
    } else if (action === 'close-install-help') {
      closeInstallHelp();
    } else if (action === 'install-now') {
      if (!deferredInstall) { openInstallHelp(); return; }
      deferredInstall.prompt();
      const choice = await deferredInstall.userChoice;
      deferredInstall = null;
      closeInstallHelp();
      render();
      toast(choice?.outcome === 'accepted' ? 'Installation wurde bestätigt.' : 'Installation wurde nicht durchgeführt. Du kannst sie später erneut starten.');
    } else if (action === 'learn-setup') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      state.view = 'learnSetup';
      render();
    } else if (action === 'exam-setup') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      state.view = 'examSetup';
      render();
    } else if (action === 'set-openbook-difficulty') {
      state.openBookDifficulty = button.dataset.level || 'easy'; store.openBookDifficulty = state.openBookDifficulty; saveStore(); render();
    } else if (action === 'openbook-help') {
      const q=currentOpenBookQuestion(); state.openBookHelpVisible=true; if(q){store.openBookHelpUsage[q.id]=(store.openBookHelpUsage[q.id]||0)+1; saveStore();} render();
    } else if (action === 'start-openbook') {
      const source = button.dataset.source || 'iso';
      const module = OPEN_BOOK_MODULES[source];
      if (!module) return;
      let localDocument = null;
      try { localDocument = await getLocalDocument(source); } catch (_) {}
      if (!localDocument) {
        state.documentSearchSource = source;
        state.view = 'documentSearch';
        render();
        await appAlert(`Wähle zuerst deine eigene PDF für „${LOCAL_DOCUMENTS[source]?.title || 'dieses Lernmodul'}“ aus. Danach kannst du das Lernmodul starten.`, {title:'PDF zuerst einrichten',symbol:'PDF'});
        return;
      }
      state.pendingSession = {mode:'openbook', pool:module.questions, options:{source}};
      state.view = 'startSetup';
      render();
    } else if (action === 'openbook-home') {
      state.openBookFeedback=null; state.openBookHelpVisible=false; state.view='openBookHome'; render();
    } else if (action === 'next-openbook') {
      const module=OPEN_BOOK_MODULES[state.openBookSource];
      const wraps = state.openBookIndex >= module.questions.length - 1;
      state.openBookIndex=(state.openBookIndex+1)%module.questions.length;
      if (wraps && state.openBookPause) state.openBookPause.completedIds = [];
      state.openBookFeedback=null; state.openBookHelpVisible=false; state.openBookStartedAt=Date.now(); render();
    } else if (action === 'document-search') {
      state.documentSearchSource = button.dataset.source || 'iso';
      state.view = 'documentSearch'; render();
    } else if (action === 'choose-local-document') {
      const source = button.dataset.source || 'iso';
      document.querySelector(`[data-local-document-input="${source}"]`)?.click();
    } else if (action === 'open-local-document') {
      const preparedWindow = window.open('about:blank', '_blank');
      await openLocalDocument(button.dataset.source || 'iso', preparedWindow);
    } else if (action === 'remove-local-document') {
      const source = button.dataset.source || 'iso';
      const doc = LOCAL_DOCUMENTS[source];
      if (!(await appConfirm(`Die lokal gespeicherte Arbeitskopie von „${doc?.title || 'dieser PDF'}“ auf diesem Gerät entfernen? Deine Originaldatei bleibt unverändert.`, {title:'Lokale PDF entfernen?',confirmLabel:'PDF entfernen',danger:true}))) return;
      await removeLocalDocument(source);
      await hydrateLocalDocumentSetup();
      toast('Lokale PDF wurde aus der App entfernt.');
    } else if (action === 'resume-session') {
      event.preventDefault();
      button.disabled = true;
      if (restoreActiveSession()) {
        render();
        toast('Der gespeicherte Durchgang wurde exakt fortgesetzt.');
      } else {
        state.view = 'home'; render(); toast('Der gespeicherte Durchgang ist unvollständig oder nicht mehr vorhanden.');
      }
    } else if (action === 'discard-session') {
      event.preventDefault();
      button.disabled = true;
      discardActiveSession();
      render();
      toast('Gespeicherter Durchgang wurde vollständig verworfen.');
    } else if (action === 'audit-journey') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      state.view = 'auditJourney'; render();
    } else if (action === 'start-audit-chapter') {
      const chapter = CARAT_AUDIT_CHAPTERS.find(ch => Number(ch.number) === Number(button.dataset.chapter));
      if (!chapter) return;
      const pool = questionsForAuditChapter(chapter);
      store.auditJourneyProgress[chapter.id] = {...(store.auditJourneyProgress[chapter.id] || {}), startedAt: store.auditJourneyProgress[chapter.id]?.startedAt || new Date().toISOString(), lastAt: new Date().toISOString()};
      store.auditJourneyLastChapter = chapter.id; saveStore();
      requestSessionStart('audit', pool, {random:false, label:`Interaktive Betriebsbegehung · Abschnitt ${chapter.number}: ${chapter.title}`, auditChapterId:chapter.id, auditChapterNumber:chapter.number});
    } else if (action === 'open-audit-docs') {
      document.querySelector('.audit-documents')?.scrollIntoView({behavior:'smooth'});
    } else if (action === 'show-carat-help') {
      const question = state.session?.questions?.[state.session.index];
      if (question) {
        const key = sessionQuestionKey(question);
        state.session.caratHelpShown = state.session.caratHelpShown || {};
        state.session.caratHelpShown[key] = true;
        store.auditHelpUsage[question.uid] = Number(store.auditHelpUsage[question.uid] || 0) + 1;
        saveActiveSession(); render();
      }
    } else if (action === 'show-path-hint') {
      const question = state.session?.questions?.[state.session.index];
      if (question) {
        const key = sessionQuestionKey(question);
        state.session.hints = state.session.hints || {};
        state.session.hints[key] = true;
        store.pathHelpUsage[question.uid] = Number(store.pathHelpUsage[question.uid] || 0) + 1;
        saveActiveSession();
        render();
      }
    } else if (action === 'speak-break') {
      if (!speakInstruction(currentRestInstruction())) toast('Sprachausgabe ist in diesem Browser nicht verfügbar.');
    } else if (action === 'speak-question') {
      const question = state.session?.questions?.[state.session.index];
      const spoken = question ? `${question.question}. ${(question.answers || []).map((answer, index) => `Antwort ${String.fromCharCode(65 + index)}: ${answer.text}`).join('. ')}` : '';
      if (!speakInstruction(spoken)) toast('Sprachausgabe ist in diesem Browser nicht verfügbar.');
    } else if (action === 'toggle-exam-flag') {
      toggleExamFlag();
    } else if (action === 'goto-exam-question') {
      const index = Number(button.dataset.index);
      if (state.session?.mode === 'exam' && Number.isInteger(index) && index >= 0 && index < state.session.questions.length) {
        state.session.index = index;
        state.session.currentQuestionStartedAt = Date.now();
        resetSessionActivityClock(state.session);
        saveActiveSession();
        render();
      }
    } else if (action === 'pause-path') {
      saveActiveSession();
      const auditMode = state.session?.mode === 'audit';
      state.view = auditMode ? 'auditJourney' : 'learningPath';
      render();
      toast(auditMode ? 'Betriebsbegehung pausiert. Du kannst genau hier fortsetzen.' : 'Lernpfad pausiert. Du kannst genau hier fortsetzen.');
    } else if (action === 'learning-path') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      pauseVideoGuide();
      state.view = 'learningPath'; render();
    } else if (action === 'start-path-module') {
      const module = LEARNING_PATH_MODULES.find(m => m.id === button.dataset.module);
      if (!module) return;
      store.learningPathProgress[module.id] = {...(store.learningPathProgress[module.id]||{}), startedAt:(store.learningPathProgress[module.id]?.startedAt||new Date().toISOString()), lastAt:new Date().toISOString()};
      store.learningPathLastModule = module.id; saveStore();
      const pool = questionsForLearningModule(module);
      requestSessionStart('path', pool, {random:false, label:`Lernpfad · ${module.title}`, pathModuleId:module.id});
    } else if (action === 'open-path-docs') {
      document.querySelector('.path-documents')?.scrollIntoView({behavior:'smooth'});
    } else if (action === 'confirm-start') {
      const pending = state.pendingSession;
      if (!pending) { state.view = 'home'; render(); return; }
      const useBreaks = button.dataset.pause === 'yes';
      const duration = Number(document.querySelector('input[name="startBreakDuration"]:checked')?.value || 3);
      const selectedInterval = Number(document.querySelector('input[name="startBreakEvery"]:checked')?.value || 20);
      const breakEvery = [20,50].includes(selectedInterval) ? selectedInterval : 20;
      store.breakGameEnabled = useBreaks;
      store.breakDurationMinutes = duration;
      store.breakEveryQuestions = breakEvery;
      saveStore();
      if (pending.mode === 'openbook') {
        startOpenBookSession({...pending.options, breakGameEnabled:useBreaks, breakDurationMinutes:duration, breakEveryQuestions:breakEvery});
        return;
      }
      startSession(pending.mode, pending.pool, {...pending.options, breakGameEnabled: useBreaks, breakDurationMinutes: duration, breakEveryQuestions: breakEvery});
    } else if (action === 'cancel-start') {
      const pendingMode = state.pendingSession?.mode;
      state.pendingSession = null;
      state.view = pendingMode === 'audit' ? 'auditJourney' : pendingMode === 'path' ? 'learningPath' : pendingMode === 'openbook' ? 'openBookHome' : 'home';
      render();
    } else if (action === 'test-break') {
      state.breakPrompt = {returnView: state.session ? 'session' : 'home', milestone: state.session?.breakAnsweredInSession || 0, moduleIndex: Number(store.breakRotationIndex || 0) % BREAK_MODULES.length};
      state.view = 'breakPrompt'; render();
    } else if (action === 'start-game') {
      startGameBreak(Number(button.dataset.minutes) || 2);
    } else if (action === 'skip-game') {
      const returnView = state.breakPrompt?.returnView || (state.session ? 'session' : 'home');
      state.breakPrompt = null; state.view = returnView; render();
    } else if (action === 'disable-game-session') {
      if (state.session) state.session.breakGameEnabled = false;
      if (state.openBookPause) state.openBookPause.enabled = false;
      const returnView = state.breakPrompt?.returnView || (state.session ? 'session' : 'home');
      state.breakPrompt = null; state.view = returnView; render();
      toast('Erholungspause für diese Lernrunde ausgeschaltet.');
    } else if (action === 'end-game') endGameBreak();
    else if (action === 'home') {
      if (state.session && !state.session.endedAt) saveActiveSession(); state.view = 'home'; state.editingUid = null; if (location.hash) history.replaceState(null, '', location.pathname + location.search); render();
    } else if (action === 'settings') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      state.view = 'settings';
      history.replaceState(null, '', '#settings');
      render();
    } else if (action === 'theme') {
      setTheme(store.theme === 'dark' ? 'light' : 'dark');
    } else if (action === 'set-theme') {
      setTheme(button.dataset.theme === 'dark' ? 'dark' : 'light');
    } else if (action === 'set-background-color') {
      setBackgroundColor(button.dataset.color);
    } else if (action === 'toggle-readable-font') {
      store.readableFont = !store.readableFont; saveDisplaySettings(); render();
    } else if (action === 'toggle-high-contrast') {
      store.highContrast = !store.highContrast; saveDisplaySettings(); render();
    } else if (action === 'set-night-level') {
      store.nightLevel = Math.max(0, Math.min(3, Number(button.dataset.level) || 0)); saveDisplaySettings(); render();
    } else if (action === 'set-break-interval') {
      const count = [20,50].includes(Number(button.dataset.count)) ? Number(button.dataset.count) : 20;
      store.breakEveryQuestions = count;
      saveStore();
      render();
      toast(`Minispiel-Pause nach jeweils ${count} Fragen gespeichert.`);
    } else if (action === 'set-cards-per-round') {
      const count = [10,20,30].includes(Number(button.dataset.count)) ? Number(button.dataset.count) : 20;
      const workshop = loadWorkshopStats(); workshop.cardsPerRound = count; saveWorkshopStats(workshop); render(); toast(`${count} Karteikarten pro Lernrunde gespeichert.`);
    } else if (action === 'reset-workshop-cards') {
      if (!(await appConfirm('Karteikarten-Lernstand wirklich zurücksetzen? Eigene Karten bleiben erhalten.', {title:'Karteikarten zurücksetzen?',confirmLabel:'Lernstand zurücksetzen',danger:true}))) return;
      const workshop = loadWorkshopStats(); workshop.leitner = {}; saveWorkshopStats(workshop); toast('Karteikarten-Lernstand wurde zurückgesetzt.');
    } else if (action === 'export-all-data') {
      exportAllData();
    } else if (action === 'choose-full-import') {
      document.getElementById('fullBackupImport')?.click();
    } else if (action === 'start-quick-exam') {
      requestSessionStart('exam', getAllQuestions(), {count: 45, threshold: store.passThreshold || 70, timeLimitSeconds: 90 * 60, examType:'full', label: 'Prüfung · 45 Fragen · 90 Minuten'});
    } else if (action === 'start-learn') {
      const category = document.getElementById('learnCategory').value;
      const random = document.getElementById('learnOrder').value === 'random';
      const label = category === 'all' ? 'Lernmodus · alle Kategorien' : `Lernmodus · ${getCategories().find(item => item.id === category)?.name || category}`;
      requestSessionStart('learn', poolFor(category), {random, label});
    } else if (action === 'repeat-wrong') {
      requestSessionStart('review', currentWrongQuestions(), {random: false, label: 'Fehlerfragen'});
    } else if (action === 'start-exam') {
      const category = document.getElementById('examCategory').value;
      const pool = poolFor(category);
      const selectedPreset = document.getElementById('examPreset')?.value || 'full';
      const preset = EXAM_PRESETS[selectedPreset];
      const count = Math.max(1, Math.min(preset?.count || Number(document.getElementById('examCount').value) || 45, pool.length));
      const threshold = Math.max(1, Math.min(preset?.threshold || Number(document.getElementById('passThreshold').value) || 70, 100));
      const minutes = Math.max(1, Math.min(preset?.minutes || Number(document.getElementById('examMinutes').value) || 90, 600));
      const examType = preset ? selectedPreset : 'custom';
      const categoryName = category === 'all' ? 'alle Kategorien' : getCategories().find(item => item.id === category)?.name || category;
      const formatName = selectedPreset.startsWith('mini') ? `Miniprüfung ${preset.label}` : selectedPreset === 'full' ? 'Vollprüfung' : 'Individuelle Prüfung';
      const label = `${formatName} · ${categoryName} · ${count} Fragen · ${minutes} Minuten`;
      requestSessionStart('exam', pool, {count, threshold, timeLimitSeconds: minutes * 60, examType, label});
    } else if (action === 'check') {
      checkLearning();
    } else if (action === 'next') {
      nextQuestion();
    } else if (action === 'prev') {
      prevQuestion();
    } else if (action === 'finish-exam') {
      await finishExam();
    } else if (action === 'catalog') {
      if (state.session && !state.session.endedAt) saveActiveSession(); state.view = 'catalog'; render();
    } else if (action === 'database') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      state.view = 'database'; render();
    } else if (action === 'statistics') {
      if (state.session && !state.session.endedAt) saveActiveSession();
      state.view = 'statistics'; render();
    } else if (action === 'show-five-day-review') {
      await showFiveDayReview(true);
    } else if (action === 'stats-range') {
      state.statsExamRange = button.dataset.range || 'all';
      render();
    } else if (action === 'stats-prev-month') {
      state.statsCalendarOffset = Number(state.statsCalendarOffset || 0) - 1;
      render();
    } else if (action === 'stats-next-month') {
      state.statsCalendarOffset = Number(state.statsCalendarOffset || 0) + 1;
      render();
    } else if (action === 'stats-today') {
      state.statsCalendarOffset = 0;
      render();
    } else if (action === 'export-statistics') {
      exportStatisticsCsv();
    } else if (action === 'reset-statistics') {
      await resetMergedStatistics();
    } else if (action === 'info') {
      if (state.session && !state.session.endedAt) saveActiveSession(); state.view = 'info'; render();
    } else if (action === 'reset-progress') {
      await resetProgress();
    } else if (action === 'delete-all-local-data') {
      await deleteAllLocalData();
    } else if (action === 'repeat-result-wrong') {
      const wrong = state.session.results.filter(result => !result.correct).map(result => result.q);
      requestSessionStart('review', wrong, {random: false, label: 'Fehler aus letzter Prüfung'});
    } else if (action === 'new-exam') {
      state.view = 'home'; state.session = null; render();
      setTimeout(() => document.getElementById('examCategory')?.focus(), 0);
    } else if (action === 'add-answer') {
      addAnswerEditor();
    } else if (action === 'remove-answer') {
      const rows = document.querySelectorAll('#answerEditorList [data-answer-row]');
      if (rows.length <= 2) { toast('Mindestens zwei Antwortfelder müssen bestehen bleiben.'); return; }
      button.closest('[data-answer-row]')?.remove();
      renumberAnswerEditors();
    } else if (action === 'edit-question') {
      editQuestion(button.dataset.uid);
    } else if (action === 'archive-question') {
      await archiveQuestion(button.dataset.uid);
    } else if (action === 'cancel-edit') {
      state.editingUid = null; render();
    } else if (action === 'restore-archived') {
      await restoreArchived();
    } else if (action === 'export-database') {
      exportDatabase();
    } else if (action === 'choose-import') {
      document.getElementById('databaseImport')?.click();
    }
  });

  document.addEventListener('keydown', event => {
    registerSessionActivity();
    if (state.tutorialActive) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishTutorial(true);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveTutorial(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTutorial(-1);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...document.querySelectorAll('#appTutorial.open button:not([hidden]):not([disabled])')];
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        return;
      }
    }
    if (event.key === 'Escape' && document.getElementById('appDialog')?.classList.contains('open')) {
      event.preventDefault();
      closeAppDialog(false);
      return;
    }
    if (event.key === 'Escape' && document.getElementById('installHelp')?.classList.contains('open')) {
      closeInstallHelp();
      return;
    }
    if (event.key === 'Escape' && document.getElementById('quickMenu')?.classList.contains('open')) {
      closeQuickMenu();
      return;
    }
    if (state.view === 'game') {
      if (event.key === 'Escape') endGameBreak();
      return;
    }
    if (event.key === 'Escape' && state.view !== 'home') {
      if (state.session && !state.session.endedAt) saveActiveSession(); state.view = 'home'; state.editingUid = null; render();
    }
  });

  let lastPassiveActivityAt = 0;
  function registerPassiveSessionActivity() {
    const now = Date.now();
    if (now - lastPassiveActivityAt < 3000) return;
    lastPassiveActivityAt = now;
    registerSessionActivity(now);
  }
  document.addEventListener('pointermove', registerPassiveSessionActivity, {passive:true});
  document.addEventListener('scroll', registerPassiveSessionActivity, {passive:true, capture:true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) registerSessionActivity(Date.now(), true);
    else resetSessionActivityClock();
    if (state.session && !state.session.endedAt) saveActiveSession();
  });
  window.addEventListener('focus', () => resetSessionActivityClock());
  window.addEventListener('qmb-account-status', event => {
    const summary = event.detail || {};
    if (['ready', 'local'].includes(summary.tone) || summary.label?.startsWith('Offline')) {
      if (Number(store.tutorialCompletedVersion || 0) < TUTORIAL_VERSION) scheduleFirstStartTutorial();
      else scheduleFiveDayReview();
    }
  });
  window.addEventListener('beforeunload', () => {
    registerSessionActivity(Date.now(), true);
    if (state.session && !state.session.endedAt) saveActiveSession();
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    const button = document.getElementById('installBtn');
    if (button) button.classList.add('ready');
    const direct = document.getElementById('installNowBtn');
    if (direct && !isStandaloneApp()) direct.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    closeInstallHelp();
    render();
    toast('Qualitätsmanager Lernplattform wurde als App installiert.');
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  const installHelpOnLoad = location.hash === '#install';
  if (location.hash === '#settings') state.view = 'settings';
  render();
  if (installHelpOnLoad) {
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(openInstallHelp, 0);
  }
})();
