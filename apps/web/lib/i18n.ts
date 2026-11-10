import { useEffect, useMemo } from 'react';

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'hi' | 'ar' | 'ja' | 'zh';

const messages: Record<string, Record<string, string>> = {
  en: {
    'nav.feed': 'Feed',
    'nav.chat': 'Messages',
    'nav.search': 'Search',
    'nav.profile': 'Profile',
    'nav.settings': 'Settings',
    'auth.login': 'Log in',
    'auth.register': 'Create account',
    'feed.empty': 'Your feed is quiet. Follow more people to fill it up.',
    'feed.loading': 'Loading your feed…',
    'feed.loadMore': 'Load more',
    'chat.placeholder': 'Type a message',
    'chat.send': 'Send',
    'post.altPrefix': 'Image: ',
    'a11y.contrast': 'High contrast mode',
    'a11y.largeText': 'Larger text',
    'a11y.skip': 'Skip to main content',
  },
  ar: {
    'nav.feed': 'الرئيسية',
    'nav.chat': 'الرسائل',
    'nav.search': 'بحث',
    'nav.profile': 'الملف',
    'nav.settings': 'الإعدادات',
    'auth.login': 'تسجيل الدخول',
    'auth.register': 'إنشاء حساب',
    'feed.empty': 'خلاصتك هادئة. تابع المزيد من الأشخاص لملئها.',
    'feed.loading': 'جارٍ تحميل خلاصتك…',
    'feed.loadMore': 'تحميل المزيد',
    'chat.placeholder': 'اكتب رسالة',
    'chat.send': 'إرسال',
    'post.altPrefix': 'صورة: ',
    'a11y.contrast': 'وضع التباين العالي',
    'a11y.largeText': 'نص أكبر',
    'a11y.skip': 'تخطَّ إلى المحتوى الرئيسي',
  },
};

/** Server sets the <html lang/dir>; this hook supports locale switch client-side. */
export function useLocale(locale: Locale = 'en') {
  const rtl = useMemo(() => ['ar', 'he', 'fa'].includes(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [locale, rtl]);

  return {
    locale,
    rtl,
    t: (key: string): string => messages[locale]?.[key] ?? messages.en[key] ?? key,
  };
}
