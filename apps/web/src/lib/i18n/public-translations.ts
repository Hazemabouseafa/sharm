export type PublicLocale = 'en' | 'ru' | 'it' | 'tr' | 'pl';

export interface PublicLanguageMeta {
  code: PublicLocale;
  short: string;
  label: string;
  nativeLabel: string;
}

export const PUBLIC_LANGUAGES: PublicLanguageMeta[] = [
  { code: 'en', short: 'EN', label: 'English', nativeLabel: 'English' },
  { code: 'ru', short: 'RU', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'it', short: 'IT', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'tr', short: 'TR', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'pl', short: 'PL', label: 'Polish', nativeLabel: 'Polski' },
];

type TranslationTuple = [ru: string, it: string, tr: string, pl: string];

/**
 * Curated instant translation dictionary mapping canonical English strings
 * to [Russian (ru), Italian (it), Turkish (tr), Polish (pl)].
 */
const EXACT_PHRASES: Record<string, TranslationTuple> = {
  // Navigation & Global Chrome
  'Home': ['Главная', 'Home', 'Ana Sayfa', 'Strona główna'],
  'Tours': ['Экскурсии', 'Tour', 'Turlar', 'Wycieczki'],
  'Cairo': ['Каир', 'Il Cairo', 'Kahire', 'Kair'],
  'Sharm El Sheikh': ['Шарм-эль-Шейх', 'Sharm El Sheikh', 'Şarm El-Şeyh', 'Sharm El Sheikh'],
  'Marsa Alam': ['Марса-Алам', 'Marsa Alam', 'Marsa Alam', 'Marsa Alam'],
  'Hurghada': ['Хургада', 'Hurghada', 'Hurgada', 'Hurghada'],
  'Luxor & Aswan': ['Луксор и Асуан', 'Luxor e Assuan', 'Luksor ve Asvan', 'Luksor i Asuan'],
  'Contact': ['Контакты', 'Contatti', 'İletişim', 'Kontakt'],
  'Book a Trip': ['Забронировать тур', 'Prenota un Tour', 'Tur Rezervasyonu', 'Zarezerwuj wycieczkę'],
  'Manage My Booking': ['Управление бронью', 'Gestisci Prenotazione', 'Rezervasyonumu Yönet', 'Zarządzaj rezerwacją'],
  'Manage Booking': ['Управление бронью', 'Gestisci Prenotazione', 'Rezervasyonu Yönet', 'Zarządzaj rezerwacją'],
  'Skip to main content': ['Перейти к основному содержанию', 'Salta al contenuto principale', 'Ana içeriğe geç', 'Przejdź do głównej treści'],
  'Explore': ['Направления', 'Esplora', 'Keşfet', 'Odkrywaj'],
  'Company & Policies': ['Компания и правила', 'Azienda e Politiche', 'Şirket ve Politikalar', 'Firma i Zasady'],
  'Guest Support': ['Поддержка гостей', 'Supporto Clienti', 'Misafir Desteği', 'Wsparcie gości'],
  'About Us': ['О нас', 'Chi Siamo', 'Hakkımızda', 'O nas'],
  'Privacy Policy': ['Политика конфиденциальности', 'Informativa sulla Privacy', 'Gizlilik Politikası', 'Polityka prywatności'],
  'Terms & Conditions': ['Условия использования', 'Termini e Condizioni', 'Şartlar ve Koşullar', 'Regulamin'],
  'Booking & Cancellation Policy': ['Правила бронирования и отмены', 'Politica di Prenotazione e Cancellazione', 'Rezervasyon ve İptal Politikası', 'Zasady rezerwacji i anulowania'],
  'Contact Us': ['Связаться с нами', 'Contattaci', 'Bize Ulaşın', 'Skontaktuj się z nami'],
  'All rights reserved.': ['Все права защищены.', 'Tutti i diritti riservati.', 'Tüm hakları saklıdır.', 'Wszelkie prawa zastrzeżone.'],

  // Home Page Hero & CMS Sections
  'Egypt.': ['Египет.', 'Egitto.', 'Mısır.', 'Egipt.'],
  'Every journey tells a story.': [
    'Каждое путешествие рассказывает историю.',
    'Ogni viaggio racconta una storia.',
    'Her yolculuk bir hikaye anlatır.',
    'Każda podróż opowiada historię.',
  ],
  'From the wonders of the Red Sea to the timeless beauty of the Pharaohs.': [
    'От чудес Красного моря до неподвластного времени величия фараонов.',
    'Dalle meraviglie del Mar Rosso alla bellezza senza tempo dei Faraoni.',
    'Kızıldeniz’in harikalarından Firavunların zamansız güzelliğine.',
    'Od cudów Morza Czerwonego po ponadczasowe piękno Faraonów.',
  ],
  'From the wonders of the Red Sea to the timeless beauty of the Pharaohs. Curated Egypt excursions with transparent pricing and licensed local guides.': [
    'От чудес Красного моря до величия фараонов. Авторские экскурсии по Египту с прозрачными ценами и лицензированными гидами.',
    'Dalle meraviglie del Mar Rosso alla bellezza senza tempo dei Faraoni. Escursioni in Egitto selezionate con prezzi trasparenti e guide locali autorizzate.',
    'Kızıldeniz’in harikalarından Firavunların zamansız güzelliğine. Şeffaf fiyatlandırma ve lisanslı yerel rehberlerle seçkin Mısır turları.',
    'Od cudów Morza Czerwonego po ponadczasowe piękno Faraonów. Wyselekcjonowane wycieczki po Egipcie z przejrzystymi cenami i licencjonowanymi przewodnikami.',
  ],
  'Explore Tours': ['Смотреть экскурсии', 'Esplora i Tour', 'Turları Keşfet', 'Zobacz wycieczki'],
  'Discover Destinations': ['Направления', 'Scopri le Destinazioni', 'Destinasyonları Keşfet', 'Odkryj kierunki'],
  'Destination': ['Направление', 'Destinazione', 'Destinasyon', 'Kierunek'],
  'All Destinations': ['Все направления', 'Tutte le destinazioni', 'Tüm Destinasyonlar', 'Wszystkie kierunki'],
  'Tour Type': ['Тип экскурсии', 'Tipo di Tour', 'Tur Tipi', 'Typ wycieczki'],
  'All Categories': ['Все категории', 'Tutte le categorie', 'Tüm Kategoriler', 'Wszystkie kategorie'],
  'Date': ['Дата', 'Data', 'Tarih', 'Data'],
  'Find Your Trip': ['Найти экскурсию', 'Trova il Tuo Tour', 'Turunu Bul', 'Znajdź wycieczkę'],
  'Where will you go next?': [
    'Куда вы отправитесь дальше?',
    'Dove andrai nel tuo prossimo viaggio?',
    'Sıradaki rotanız neresi?',
    'Dokąd wybierzesz się następnym razem?',
  ],
  'Five iconic regions across Egypt — from coral sanctuaries of South Sinai to the royal temples of Upper Egypt.': [
    'Пять легендарных регионов Египта — от коралловых заповедников Южного Синая до царских храмов Верхнего Египта.',
    'Cinque regioni iconiche dell’Egitto — dai santuari corallini del Sinai del Sud ai templi reali dell’Alto Egitto.',
    'Güney Sina’nın mercan cennetlerinden Yukarı Mısır’ın kraliyet tapınaklarına kadar Mısır’ın beş ikonik bölgesi.',
    'Pięć kultowych regionów Egiptu — od raf koralowych Południowego Synaju po królewskie świątynie Górnego Egiptu.',
  ],
  'Popular Egypt Excursions': [
    'Популярные экскурсии по Египту',
    'Escursioni Popolari in Egitto',
    'Popüler Mısır Turları',
    'Popularne wycieczki po Egipcie',
  ],
  'Hand-picked day trips, yacht cruises, and private Egyptologist tours with real-time seat availability.': [
    'Лучшие однодневные туры, круизы на яхтах и индивидуальные экскурсии с египтологом и наличием мест в реальном времени.',
    'Escursioni giornaliere selezionate, crociere in yacht e tour privati con egittologo con disponibilità in tempo reale.',
    'Gerçek zamanlı kontenjanlarla özenle seçilmiş günübirlik turlar, yat gezileri ve özel Mısırbilimci turları.',
    'Starannie wybrane wycieczki jednodniowe, rejsy jachtem i prywatne wyprawy z egiptologiem z dostępnością miejsc na żywo.',
  ],
  'View All Tours': ['Все экскурсии', 'Vedi Tutti i Tour', 'Tüm Turları Gör', 'Zobacz wszystkie wycieczki'],
  "More than a trip — a story you'll carry home": [
    'Больше чем поездка — история, которую вы увезете домой',
    'Più di un viaggio — una storia che porterai a casa',
    'Bir geziden fazlası — evinize taşıyacağınız bir hikaye',
    'Więcej niż podróż — historia, którą zabierzesz do domu',
  ],
  'Why travel with Sharm Pharaoh?': [
    'Почему путешествуют с Sharm Pharaoh?',
    'Perché viaggiare con Sharm Pharaoh?',
    'Neden Sharm Pharaoh ile seyahat etmelisiniz?',
    'Dlaczego warto podróżować z Sharm Pharaoh?',
  ],
  'Licensed Egyptologists & Marine Guides': [
    'Лицензированные египтологи и морские гиды',
    'Egittologi Autorizzati e Guide Marine',
    'Lisanslı Mısırbilimciler ve Deniz Rehberleri',
    'Licencjonowani egiptolodzy i przewodnicy morscy',
  ],
  'Transparent Pricing & Instant Quotes': [
    'Прозрачные цены и мгновенный расчет',
    'Prezzi Trasparenti e Preventivi Istantanei',
    'Şeffaf Fiyatlandırma ve Anında Teklif',
    'Przejrzyste ceny i natychmiastowa wycena',
  ],
  'Confirmed Resort & Port Pickup': [
    'Гарантированный трансфер из отеля и порта',
    'Trasferimento Garantito da Resort e Porto',
    'Onaylı Otel ve Liman Transferi',
    'Potwierdzony odbiór z hotelu i portu',
  ],
  'Flexible Pay-Later & Free Cancellation Tiers': [
    'Оплата позже и гибкая бесплатная отмена',
    'Paga Dopo e Cancellazione Gratuita Flessibile',
    'Esnek Sonra Öde ve Ücretsiz İptal Seçenekleri',
    'Elastyczna płatność później i darmowe anulowanie',
  ],
  'Frequently Asked Questions': [
    'Часто задаваемые вопросы',
    'Domande Frequenti',
    'Sıkça Sorulan Sorular',
    'Często zadawane pytania',
  ],
  'Everything you need to know before booking your Egypt excursion.': [
    'Всё, что нужно знать перед бронированием экскурсии в Египте.',
    'Tutto ciò che devi sapere prima di prenotare la tua escursione in Egitto.',
    'Mısır turunuzu rezerve etmeden önce bilmeniz gereken her şey.',
    'Wszystko, co warto wiedzieć przed rezerwacją wycieczki w Egipcie.',
  ],

  // Tours Listing & Filters
  'Your next adventure starts here': [
    'Ваше новое приключение начинается здесь',
    'La tua prossima avventura inizia qui',
    'Yeni maceranız burada başlıyor',
    'Twoja kolejna przygoda zaczyna się tutaj',
  ],
  'Filter by destination, category, date, and budget with live Cairo departure availability.': [
    'Фильтруйте по направлению, категории, дате и бюджету с актуальным наличием мест по времени Каира.',
    'Filtra per destinazione, categoria, data e budget con disponibilità in tempo reale.',
    'Gerçek zamanlı kontenjanlarla destinasyon, kategori, tarih ve bütçeye göre filtreleyin.',
    'Filtruj według kierunku, kategorii, daty i budżetu z dostępnością miejsc na żywo.',
  ],
  'Search tours...': ['Поиск экскурсий...', 'Cerca tour...', 'Tur ara...', 'Szukaj wycieczek...'],
  'Keyword': ['Ключевое слово', 'Parola chiave', 'Anahtar Kelime', 'Słowo kluczowe'],
  'Category': ['Категория', 'Categoria', 'Kategori', 'Kategoria'],
  'Sort By': ['Сортировка', 'Ordina per', 'Sırala', 'Sortuj według'],
  'Featured': ['Рекомендуемые', 'In evidenza', 'Öne Çıkanlar', 'Polecane'],
  'Price: Low to High': ['Цена: по возрастанию', 'Prezzo: crescente', 'Fiyat: Düşükten Yükseğe', 'Cena: od najniższej'],
  'Price: High to Low': ['Цена: по убыванию', 'Prezzo: decrescente', 'Fiyat: Yüksekten Düşüğe', 'Cena: od najwyższej'],
  'Duration: Shortest': ['Длительность: короткие', 'Durata: più breve', 'Süre: En Kısa', 'Czas trwania: najkrótsze'],
  'Apply Filters': ['Применить фильтры', 'Applica Filtri', 'Filtreleri Uygula', 'Zastosuj filtry'],
  'Reset': ['Сбросить', 'Reimposta', 'Sıfırla', 'Resetuj'],
  'View Details': ['Подробнее', 'Vedi Dettagli', 'Detayları Gör', 'Zobacz szczegóły'],
  'From': ['От', 'Da', 'Başlangıç:', 'Od'],
  'per person': ['за человека', 'a persona', 'kişi başı', 'za osobę'],
  'per group': ['за группу', 'per gruppo', 'grup başı', 'za grupę'],
  'Private Group': ['Индивидуально', 'Gruppo Privato', 'Özel Grup', 'Grupa prywatna'],
  'No matching tours found': ['Подходящие экскурсии не найдены', 'Nessun tour corrispondente trovato', 'Eşleşen tur bulunamadı', 'Nie znaleziono pasujących wycieczek'],

  // Categories
  'Red Sea Boat & Yacht': ['Морские прогулки и яхты', 'Barca e Yacht Mar Rosso', 'Kızıldeniz Tekne ve Yat', 'Rejsy statkiem i jachtem'],
  'Snorkeling & Diving': ['Снорклинг и дайвинг', 'Snorkeling e Immersioni', 'Şnorkel ve Dalış', 'Snorkeling i nurkowanie'],
  'Desert Safari': ['Сафари в пустыне', 'Safari nel Deserto', 'Çöl Safarisi', 'Safari na pustyni'],
  'Historical & Cultural': ['История и культура', 'Storico e Culturale', 'Tarihi ve Kültürel', 'Historia i kultura'],
  'Private Excursions': ['Индивидуальные туры', 'Escursioni Private', 'Özel Turlar', 'Wycieczki prywatne'],
  'Family & Adventure': ['Семья и приключения', 'Famiglia e Avventura', 'Aile ve Macera', 'Rodzina i przygoda'],

  // Destinations & Seeded Tours
  'Pyramids, Grand Egyptian Museum & Nile Heritage': [
    'Пирамиды, Большой Египетский музей и наследие Нила',
    'Piramidi, Grande Museo Egizio ed Eredità del Nilo',
    'Piramitler, Büyük Mısır Müzesi ve Nil Mirası',
    'Piramidy, Wielkie Muzeum Egipskie i dziedzictwo Nilu',
  ],
  'Coral Sanctuaries, Ras Mohamed & Sinai Desert': [
    'Коралловые заповедники, Рас-Мохаммед и пустыня Синая',
    'Santuari Corallini, Ras Mohamed e Deserto del Sinai',
    'Mercan Cennetleri, Ras Muhammed ve Sina Çölü',
    'Rafy koralowe, Ras Mohamed i pustynia Synaj',
  ],
  'Sea Turtles, Dolphin Reefs & Untouched Lagoons': [
    'Морские черепахи, рифы дельфинов и нетронутые лагуны',
    'Tartarughe Marine, Barriere dei Delfini e Lagune Incontaminate',
    'Deniz Kaplumbağaları, Yunus Resifleri ve Bakir Lagünler',
    'Żółwie morskie, rafy delfinów i dziewicze laguny',
  ],
  'Island Sandbars, Red Sea Reefs & Desert Wadis': [
    'Песчаные острова, рифы Красного моря и пустынные вади',
    'Isole Sabbiose, Barriere del Mar Rosso e Wadi del Deserto',
    'Ada Kumsalları, Kızıldeniz Resifleri ve Çöl Vadileri',
    'Piaszczyste wyspy, rafy Morza Czerwonego i pustynne wadi',
  ],
  'Valley of the Kings, Karnak & Eternal Nile': [
    'Долина Царей, Карнак и вечный Нил',
    'Valle dei Re, Karnak ed Eterno Nilo',
    'Krallar Vadisi, Karnak ve Ebedi Nil',
    'Dolina Królów, Karnak i wieczny Nil',
  ],
  'Giza Pyramids, Sphinx & Grand Egyptian Museum Day Tour': [
    'Пирамиды Гизы, Сфинкс и Большой Египетский музей — однодневный тур',
    'Tour Giornaliero Piramidi di Giza, Sfinge e Grande Museo Egizio',
    'Gize Piramitleri, Sfenks ve Büyük Mısır Müzesi Günlük Turu',
    'Piramidy w Gizie, Sfinks i Wielkie Muzeum Egipskie — wycieczka jednodniowa',
  ],
  'Private Cairo by Air from Sharm El Sheikh': [
    'Индивидуальный тур в Каир на самолете из Шарм-эль-Шейха',
    'Il Cairo Privato in Aereo da Sharm El Sheikh',
    'Şarm El-Şeyh’ten Uçakla Özel Kahire Turu',
    'Prywatny Kair samolotem z Sharm El Sheikh',
  ],
  'Old Cairo, Saladin Citadel & Khan El Khalili Bazaar': [
    'Старый Каир, Цитадель Саладина и базар Хан-эль-Халили',
    'Vecchio Cairo, Cittadella di Saladino e Bazar Khan El Khalili',
    'Eski Kahire, Selahaddin Kalesi ve Han el-Halili Çarşısı',
    'Stary Kair, Cytadela Saladyna i bazar Chan al-Chalili',
  ],
  'Cairo Nile Dinner Cruise & Folklore Show': [
    'Вечерний круиз по Нилу с ужином и фольклорным шоу',
    'Crociera con Cena sul Nilo al Cairo e Spettacolo Folcloristico',
    'Kahire Nil Akşam Yemeği Tekne Turu ve Folklor Şovu',
    'Wieczorny rejs z kolacją po Nilu i pokazem folklorystycznym',
  ],
  'Ras Mohamed National Park & White Island Yacht Cruise': [
    'Заповедник Рас-Мохаммед и Белый остров — круиз на яхте',
    'Parco Nazionale di Ras Mohamed e Isola Bianca in Yacht',
    'Ras Muhammed Milli Parkı ve Beyaz Ada Yat Turu',
    'Park Narodowy Ras Mohamed i Biała Wyspa — rejs jachtem',
  ],
  'Tiran Island Coral Reefs Snorkeling Cruise': [
    'Морская прогулка и снорклинг у коралловых рифов острова Тиран',
    'Crociera Snorkeling sulla Barriera Corallina dell’Isola di Tiran',
    'Tiran Adası Mercan Resifleri Şnorkel Tekne Turu',
    'Rejs ze snorkelingiem na rafach koralowych wyspy Tiran',
  ],
  'Sinai Desert Quad Bike Safari & Bedouin Stargazing Dinner': [
    'Сафари на квадроциклах в пустыне Синая и бедуинский ужин под звездами',
    'Safari in Quad nel Deserto del Sinai e Cena Beduina Sotto le Stelle',
    'Sina Çölü ATV Safarisi ve Yıldızlar Altında Bedevi Akşam Yemeği',
    'Safari quadami na pustyni Synaj i kolacja beduińska pod gwiazdami',
  ],
  'Dahab Blue Hole, Colored Canyon & Camel Coastal Ride': [
    'Голубая дыра в Дахабе, Цветной каньон и прогулка на верблюдах',
    'Blue Hole di Dahab, Canyon Colorato e Passeggiata in Cammello',
    'Dahab Mavi Delik, Renkli Kanyon ve Sahilde Deve Turu',
    'Blue Hole w Dahab, Kolorowy Kanion i przejażdżka na wielbłądach',
  ],
  'Introductory Red Sea Scuba Dive (2 Guided Boat Dives)': [
    'Погружение с аквалангом в Красном море (2 погружения с яхты)',
    'Battesimo del Mare nel Mar Rosso (2 Immersioni Guidate in Barca)',
    'Kızıldeniz التمهيدي Tüplü Dalış (2 Rehberli Tekne Dalışı)',
    'Wprowadzające nurkowanie w Morzu Czerwonym (2 nurkowania z łodzi)',
  ],
  'Abu Dabbab Bay Sea Turtle & Dugong Snorkeling Excursion': [
    'Бухта Абу-Даббаб: снорклинг с морскими черепахами и дюгонем',
    'Baia di Abu Dabbab: Snorkeling con Tartarughe Marine e Dugongo',
    'Abu Dabbab Koyu Deniz Kaplumbağası ve Dugong Şnorkel Turu',
    'Zatoka Abu Dabbab: snorkeling z żółwiami morskimi i diugoniem',
  ],
  'Sataya Dolphin House Reef Full-Day Boat Expedition': [
    'Риф Сатайя (Дом дельфинов) — морская экспедиция на целый день',
    'Spedizione Giornaliera in Barca alla Barriera dei Delfini di Sataya',
    'Sataya Yunus Evi Resifi Tam Gün Tekne Keşfi',
    'Rafa Sataya (Dom Delfinów) — całodniowa wyprawa łodzią',
  ],
  'Hamata Islands Virgin Atolls Snorkeling Day Cruise': [
    'Заповедные острова Хамата — однодневный круиз со снорклингом',
    'Crociera Giornaliera Snorkeling agli Atolli Vergini delle Isole Hamata',
    'Hamata Adaları Bakir Atolleri Günlük Şnorkel Turu',
    'Dziewicze atole wysp Hamata — całodniowy rejs ze snorkelingiem',
  ],
  'Orange Bay Island Lagoon & Coral Gardens Yacht Day': [
    'Лагуна острова Оранж-Бей и коралловые сады — день на яхте',
    'Laguna di Orange Bay e Giardini di Corallo in Yacht',
    'Orange Bay Adası Lagünü ve Mercan Bahçeleri Yat Günü',
    'Laguna wyspy Orange Bay i ogrody koralowe — dzień na jachcie',
  ],
  'Hurghada Red Sea Desert Super Safari by Jeep & Quad': [
    'Супер-сафари в пустыне Хургады на джипах и квадроциклах',
    'Super Safari nel Deserto di Hurghada in Jeep e Quad',
    'Hurgada Çölünde Jeep ve ATV ile Süper Safari',
    'Super safari na pustyni w Hurghadzie jeepem i quadem',
  ],
  'Luxor Valley of the Kings, Hatshepsut & Karnak Temples': [
    'Луксор: Долина Царей, храм Хатшепсут и Карнакский храм',
    'Luxor: Valle dei Re, Tempio di Hatshepsut e Templi di Karnak',
    'Luksor Krallar Vadisi, Hatşepsut ve Karnak Tapınakları',
    'Luksor: Dolina Królów, świątynia Hatszepsut i Karnak',
  ],
  'Sunrise Luxor Hot Air Balloon & West Bank Royal Tombs': [
    'Полет на воздушном шаре в Луксоре на рассвете и гробницы Западного берега',
    'Mongolfiera all’Alba a Luxor e Tombe Reali della Riva Occidentale',
    'Luksor Gün Doğumu Sıcak Hava Balonu ve Batı Yakası Kraliyet Mezarları',
    'Lot balonem o wschodzie słońca w Luksorze i grobowce Zachodniego Brzegu',
  ],

  // Tour Detail, Booking Panel & Checkout
  'Overview': ['Обзор', 'Panoramica', 'Genel Bakış', 'Przegląd'],
  'Tour Highlights': ['Главные впечатления', 'Punti Salienti del Tour', 'Turun Öne Çıkanları', 'Główne atrakcje wycieczki'],
  'Itinerary': ['Программа экскурсии', 'Itinerario', 'Tur Programı', 'Plan wycieczki'],
  "What's Included": ['Что включено', 'Cosa è Incluso', 'Neler Dahil', 'Co jest wliczone'],
  'Not Included': ['Не включено', 'Non Incluso', 'Dahil Olmayanlar', 'Nie wliczone'],
  'What to Bring': ['Что взять с собой', 'Cosa Portare', 'Yanınıza Almanız Gerekenler', 'Co zabrać ze sobą'],
  'Cancellation & Booking Policy': ['Правила бронирования и отмены', 'Politica di Prenotazione e Cancellazione', 'İptal ve Rezervasyon Politikası', 'Zasady rezerwacji i anulowania'],
  'Select Departure Date & Time': ['Выберите дату и время выезда', 'Seleziona Data e Ora di Partenza', 'Kalkış Tarihi ve Saatini Seçin', 'Wybierz datę i godzinę wyjazdu'],
  'Travelers': ['Путешественники', 'Viaggiatori', 'Yolcular', 'Podróżni'],
  'Pickup Zone': ['Зона трансфера', 'Zona di Prelievo', 'Alınış Bölgesi', 'Strefa odbioru'],
  'Optional Add-ons': ['Дополнительные услуги', 'Extra Opzionali', 'İsteğe Bağlı Ekstralar', 'Opcjonalne dodatki'],
  'Promo Code': ['Промокод', 'Codice Promo', 'Promosyon Kodu', 'Kod promocyjny'],
  'Apply': ['Применить', 'Applica', 'Uygula', 'Zastosuj'],
  'Total': ['Итого', 'Totale', 'Toplam', 'Razem'],
  'Continue to Booking': ['Перейти к бронированию', 'Continua con la Prenotazione', 'Rezervasyona Devam Et', 'Przejdź do rezerwacji'],
  'No account required · Transparent pricing upfront': [
    'Регистрация не требуется · Прозрачная цена без скрытых доплат',
    'Nessun account richiesto · Prezzi trasparenti fin da subito',
    'Hesap gerekmez · Baştan şeffaf fiyatlandırma',
    'Bez zakładania konta · Przejrzyste ceny z góry',
  ],
  'Complete your booking request': [
    'Оформление заявки на бронирование',
    'Completa la tua richiesta di prenotazione',
    'Rezervasyon talebinizi tamamlayın',
    'Dokończ prośbę o rezerwację',
  ],
  'Lead Traveler Details': ['Данные основного туриста', 'Dati del Viaggiatore Principale', 'Ana Yolcu Bilgileri', 'Dane głównego podróżnego'],
  'Full Name': ['Полное имя', 'Nome Completo', 'Ad Soyad', 'Imię i nazwisko'],
  'Email Address': ['Электронная почта', 'Indirizzo Email', 'E-posta Adresi', 'Adres e-mail'],
  'Phone / WhatsApp': ['Телефон / WhatsApp', 'Telefono / WhatsApp', 'Telefon / WhatsApp', 'Telefon / WhatsApp'],
  'Hotel / Pickup Location': ['Отель / Место посадки', 'Hotel / Luogo di Prelievo', 'Otel / Alınış Noktası', 'Hotel / Miejsce odbioru'],
  'Nationality': ['Гражданство', 'Nazionalità', 'Uyruk', 'Obywatelstwo'],
  'Special Requests': ['Особые пожелания', 'Richieste Speciali', 'Özel İstekler', 'Specjalne życzenia'],
  'Payment Choice': ['Способ оплаты', 'Metodo di Pagamento', 'Ödeme Seçeneği', 'Wybór płatności'],
  'Pay Later (Booking Request)': [
    'Оплата позже (Заявка на бронь)',
    'Paga Dopo (Richiesta di Prenotazione)',
    'Sonra Öde (Rezervasyon Talebi)',
    'Zapłać później (Prośba o rezerwację)',
  ],
  'Manual Bank Transfer': ['Банковский перевод', 'Bonifico Bancario', 'Banka Havalesi / EFT', 'Przelew bankowy'],
  'Submit Booking Request': ['Отправить заявку на бронь', 'Invia Richiesta di Prenotazione', 'Rezervasyon Talebini Gönder', 'Wyślij prośbę o rezerwację'],
  'Order Summary': ['Сводка заказа', 'Riepilogo Ordine', 'Sipariş Özeti', 'Podsumowanie zamówienia'],
  'Due now': ['К оплате сейчас', 'Da pagare ora', 'Şimdi ödenecek', 'Płatne teraz'],
  'Due later': ['К оплате позже', 'Da pagare dopo', 'Sonra ödenecek', 'Płatne później'],
  'Booking Request Received': ['Заявка на бронирование получена', 'Richiesta di Prenotazione Ricevuta', 'Rezervasyon Talebi Alındı', 'Otrzymano prośbę o rezerwację'],
  'Booking Confirmed': ['Бронирование подтверждено', 'Prenotazione Confermata', 'Rezervasyon Onaylandı', 'Rezerwacja potwierdzona'],
  'Booking Reference': ['Номер бронирования', 'Riferimento Prenotazione', 'Rezervasyon Kodu', 'Numer rezerwacji'],
  'Grand Total': ['Общая сумма', 'Totale Complessivo', 'Genel Toplam', 'Kwota całkowita'],
  'Payment Status': ['Статус оплаты', 'Stato del Pagamento', 'Ödeme Durumu', 'Status płatności'],

  // Contact Page
  "Let's plan your journey": [
    'Спланируем ваше путешествие',
    'Pianifichiamo il tuo viaggio',
    'Yolculuğunuzu birlikte planlayalım',
    'Zaplanujmy Twoją podróż',
  ],
  'Send Inquiry': ['Отправить запрос', 'Invia Richiesta', 'Mesaj Gönder', 'Wyślij zapytanie'],
  'Message': ['Сообщение', 'Messaggio', 'Mesajınız', 'Wiadomość'],
};

const WORD_FRAGMENTS: Array<[RegExp, TranslationTuple]> = [
  [/^Adult \(12\+\)$/i, ['Взрослый (12+)', 'Adulto (12+)', 'Yetişkin (12+)', 'Dorosły (12+)']],
  [/^Child \(4-11\)$/i, ['Ребенок (4-11)', 'Bambino (4-11)', 'Çocuk (4-11)', 'Dziecko (4-11)']],
  [/^Infant \(0-3\)$/i, ['Младенец (0-3)', 'Neonato (0-3)', 'Bebek (0-3)', 'Niemowlę (0-3)']],
  [/^Explore (.+) Tours$/i, ['Смотреть туры: $1', 'Esplora i Tour: $1', '$1 Turlarını Keşfet', 'Zobacz wycieczki: $1']],
  [/^From (\$\d+(?:\.\d+)?)$/i, ['От $1', 'Da $1', '$1’den başlayan', 'Od $1']],
  [/^(\d+)\s*hours?$/i, ['$1 ч.', '$1 ore', '$1 saat', '$1 godz.']],
  [/^Full Day \((\d+)h\)$/i, ['Полный день ($1 ч.)', 'Giornata Intera ($1h)', 'Tam Gün ($1 saat)', 'Cały dzień ($1 godz.)']],
  [/^Half Day \((\d+)h\)$/i, ['Полдня ($1 ч.)', 'Mezza Giornata ($1h)', 'Yarım Gün ($1 saat)', 'Pół dnia ($1 godz.)']],
  [/^Evening \((\d+)h\)$/i, ['Вечер ($1 ч.)', 'Sera ($1h)', 'Akşam ($1 saat)', 'Wieczór ($1 godz.)']],
  [/^Seats allocated:\s*(\d+)\s*·\s*(\d+)\s*remaining$/i, ['Выбрано мест: $1 · осталось: $2', 'Posti: $1 · $2 disponibili', 'Koltuk: $1 · $2 kalan', 'Miejsca: $1 · pozostało: $2']],
  [/^Showing (\d+) of (\d+) tours$/i, ['Показано $1 из $2 экскурсий', 'Mostrando $1 di $2 tour', '$2 turdan $1 tanesi gösteriliyor', 'Wyświetlanie $1 z $2 wycieczek']],
];

function tupleIndex(locale: Exclude<PublicLocale, 'en'>): 0 | 1 | 2 | 3 {
  switch (locale) {
    case 'ru':
      return 0;
    case 'it':
      return 1;
    case 'tr':
      return 2;
    case 'pl':
      return 3;
  }
}

const CASE_INSENSITIVE_MAP = new Map<string, TranslationTuple>();
for (const [k, v] of Object.entries(EXACT_PHRASES)) {
  CASE_INSENSITIVE_MAP.set(k.toLowerCase(), v);
}

/**
 * Synchronous zero-latency lookup for a single text string in Russian, Italian, Turkish, or Polish.
 * Returns null if the text is not in the static dictionary or pattern rules.
 */
export function lookupStaticPublicTranslation(text: string, locale: PublicLocale): string | null {
  if (locale === 'en') return text;
  const trimmed = text.trim();
  if (!trimmed || /^[\d\s$€£.,:+/\-–—·•()@#%*]+$/.test(trimmed)) return null;

  const idx = tupleIndex(locale);
  const direct = EXACT_PHRASES[trimmed] ?? CASE_INSENSITIVE_MAP.get(trimmed.toLowerCase());
  if (direct) {
    return text.replace(trimmed, direct[idx]);
  }

  for (const [regex, tuple] of WORD_FRAGMENTS) {
    if (regex.test(trimmed)) {
      const replaced = trimmed.replace(regex, tuple[idx]);
      return text.replace(trimmed, replaced);
    }
  }

  return null;
}
