// Ukrainian UI strings
export const t = {
  appName: "VanLink",
  tagline: "Логістика перевезень PL → UA",
  // Auth
  signIn: "Увійти",
  signOut: "Вийти",
  emailLabel: "Email",
  emailPlaceholder: "ваш@email.com",
  sendMagicLink: "Надіслати посилання для входу",
  checkInbox: "Перевірте пошту — ми надіслали посилання для входу.",
  // Roles
  roleDriver: "Водій",
  roleAdmin: "Адміністратор",
  roleBroker: "Брокер",
  // Driver form
  newTrip: "Нова поїздка",
  companyName: "Назва компанії",
  carNumber: "Номер тягача",
  trailerNumber: "Номер причепа",
  fullName: "ПІБ (як у паспорті)",
  passportNumber: "Номер паспорта",
  phone: "Телефон",
  borderCrossing: "Пункт перетину кордону",
  vinList: "Останні 4 цифри VIN кожного авто",
  addVin: "Додати VIN",
  removeVin: "Видалити",
  photos: "Фотографії",
  uploadPhotos: "Завантажити фото",
  submit: "Надіслати на перевірку",
  submitting: "Надсилання…",
  // Photo categories
  cat_van_overview: "Огляд фургона (1 фото)",
  cat_van_corners: "Кути фургона (4 фото)",
  cat_vin_plate: "VIN-табличка (1 фото)",
  cat_vin_windshield: "VIN під лобовим склом (1 фото)",
  cat_interior: "Салон — механіка/автомат (1 фото)",
  cat_cargo: "Вантажний відсік (1 фото)",
  cat_documents: "Документи без штампів (3 фото)",
  // Statuses
  statusPending: "Очікує перевірки",
  statusApproved: "Затверджено",
  statusResubmit: "Потрібно перезавантажити фото",
  // Waiting
  waitingTitle: "Очікуємо підтвердження",
  waitingDesc: "Адміністратор перевірить ваші фото найближчим часом.",
  rejectedTitle: "Деякі фото потрібно переробити",
  adminCommentLabel: "Коментар адміністратора",
  rejectedPhotos: "Відхилені фото",
  resubmit: "Перезавантажити фото",
  // Admin
  trips: "Поїздки",
  driver: "Водій",
  date: "Дата",
  status: "Статус",
  noTrips: "Поки що немає поїздок.",
  open: "Відкрити",
  back: "Назад",
  approveAll: "Затвердити поїздку",
  rejectAndSendBack: "Відхилити та повернути водієві",
  rejectionComment: "Коментар (буде надіслано водієві)",
  approvePhoto: "OK",
  rejectPhoto: "Відхилити",
  photoComment: "Коментар до фото",
  // Misc
  loading: "Завантаження…",
  error: "Помилка",
  required: "Обов'язкове поле",
  // Borders (PL → UA)
  borders: [
    "Дорогуськ — Ягодин",
    "Гребенне — Рава-Руська",
    "Корчова — Краковець",
    "Медика — Шегині",
    "Будомеж — Грушів",
    "Долгобичув — Угринів",
    "Зосін — Устилуг",
  ],
} as const;

export const PHOTO_CATEGORIES = [
  { key: "van_overview", label: t.cat_van_overview, count: 1 },
  { key: "van_corners", label: t.cat_van_corners, count: 4 },
  { key: "vin_plate", label: t.cat_vin_plate, count: 1 },
  { key: "vin_windshield", label: t.cat_vin_windshield, count: 1 },
  { key: "interior", label: t.cat_interior, count: 1 },
  { key: "cargo", label: t.cat_cargo, count: 1 },
  { key: "documents", label: t.cat_documents, count: 3 },
] as const;

export type PhotoCategoryKey = (typeof PHOTO_CATEGORIES)[number]["key"];