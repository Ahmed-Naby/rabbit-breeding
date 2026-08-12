/**
 * What the model is told, and what it is told not to do.
 *
 * Kept out of the route (and free of any server-only import) so the wording
 * can be read, reviewed and tested as the product decision it is rather than
 * as a string buried in a fetch call.
 */

/**
 * The rules, in the order they matter.
 *
 * Written in Arabic because the answer must come back in Arabic — instructing
 * in one language and demanding output in another is a reliable way to get a
 * paragraph of English apology in the middle of an Arabic list.
 */
export const INSIGHTS_SYSTEM_PROMPT = `أنت مستشار إنتاج في مزارع الأرانب، خبرتك عملية في الظروف المصرية: أسعار العلف المرتفعة، هامش ربح ضيق، وقطعان صغيرة ومتوسطة.

تصلك أرقام مزرعة واحدة، محسوبة من سجلاتها الفعلية. مهمتك أن تقرأها وتخرج بتوصيات قابلة للتنفيذ هذا الأسبوع.

قواعد ملزمة:
1. لا تخترع أي رقم. كل رقم تذكره يجب أن يكون موجودًا حرفيًا في البيانات المرسلة إليك، أو ناتجًا عن عملية حسابية بسيطة وواضحة عليها.
2. كل توصية يجب أن تذكر في حقل metrics المفاتيح التي استندت إليها، بمساراتها الكاملة كما وردت (مثال: "productivity.marginPerKg"). أي توصية تذكر مفتاحًا غير موجود ستُحذف بالكامل.
3. القيمة null تعني «غير مسجّل»، ولا تعني صفرًا. إن كان نقص التسجيل نفسه هو المشكلة، فاجعل ذلك توصية صريحة.
4. رتّب التوصيات بأثرها على دخل المزرعة: ما يكلّف مالًا اليوم قبل ما هو تحسين طويل الأجل.
5. لا تُشخّص مرضًا ولا تصف دواءً ولا جرعة — البيانات لا تحتملها.
6. اذكر أرقام الأمهات (tagId) صراحةً حين تكون التوصية عنهنّ، ليعرف صاحب المزرعة على من ينفّذ.
7. اكتب بالعربية، بلغة مزرعة لا بلغة تقارير: جمل قصيرة ومباشرة.

أخرج JSON فقط، بلا أي نص قبله أو بعده، بهذا الشكل تمامًا:
{
  "headline": "جملة واحدة تصف حال المزرعة الآن",
  "recommendations": [
    {
      "title": "الملاحظة في سطر",
      "detail": "لماذا تقول الأرقام ذلك",
      "action": "ما الذي يُنفَّذ عمليًا",
      "priority": "high" أو "medium" أو "low",
      "metrics": ["مسار.المفتاح", "مسار.آخر"]
    }
  ]
}

من ٣ إلى ٦ توصيات. لا أكثر.`;

/**
 * What each key means, in one line.
 *
 * Without this the model has to guess from the name, and the two names most
 * worth getting right are the two most easily confused: the lifetime averages
 * divide by the events that happened (جودة الأم), while productivity.* divides
 * by every doe standing in the barn (إنتاجية القطيع). A reader who mixes them
 * up concludes the opposite of the truth about idle does.
 */
const GLOSSARY = `دليل المفاتيح:
- windowDays: طول الفترة التي تخص كل أرقام "window" (بالأيام). ما عداها إما رصيد حالي أو حساب على عمر المزرعة كله.
- herd: عدد الأمهات والذكور المسجّلين والعاملين الآن، والسلالات (البدائل) وكم منها تجاوز ٣ شهور.
- window.*: ما حدث فعلًا داخل الفترة (تلقيح، جس موجب، ولادات، فطام، بيع، نفوق، استبعاد).
- window.conceptionRatePct: الجس الموجب ÷ التلقيح داخل الفترة.
- lifetime.*: متوسطات على عمر المزرعة كله، مقسومة على عدد الأحداث — أي "جودة الأم المنتجة".
- productivity.*: نفس الإنتاج لكن مقسومًا على كل أم في العنبر — أي "إنتاجية القطيع". الفرق بين المجموعتين هو تكلفة الأمهات الخاملة.
- productivity.targetCyclesPerYear: عدد الدورات السنوية التي يَعِد بها نظام إعادة التلقيح المضبوط في الإعدادات.
- productivity.cycleAchievementPct: المُحقَّق ÷ المستهدف من الدورات، بالمئة.
- productivity.realizedPricePerKg: ما حصّلته المزرعة فعلًا لكل كيلو مباع.
- productivity.breakEvenPricePerKg: السعر الذي يجب أن يبلغه الكيلو حتى تتعادل المزرعة.
- productivity.marginPerKg: المحصّل ناقص التعادل. السالب يعني أن كل كيلو بيع عمّق الخسارة.
- productivity.feedConversionRatio: كيلو علف لكل كيلو لحم مباع، على مستوى القطيع كله.
- does.scoredAgainstLitterSize: متوسط عدد الخلفة الحي للمزرعة — وهو الأساس الذي تُقاس عليه درجة كل أم.
- does.weakCount / weakSharePct: الأمهات الضعيفات وعددهنّ من القطيع.
- does.cycleDays: كم يومًا يُسمح للأم أن تمضيها بلا ولادة قبل أن تُعتبر متأخرة.
- does.idleCount: الأمهات المتأخرات عن موعد ولادتهنّ.
- does.cullCandidates / cullBucks: المرشّحون للاستبعاد بمعيار الخصوبة.
- weakDoes / bestDoes / idleDoes: أسماء (أرقام) الأمهات المعنيات، مع أرقامهنّ الخاصة.
- settings.*: إعدادات المزرعة — سعر بيع الكيلو، سعر طن العلف، مدة إعادة التلقيح، مدة الحمل.
- كل المبالغ بعملة الحقل currency.`;

/** The one message the model receives: the glossary, then the farm. */
export function buildInsightsPrompt(summary: unknown): string {
  return `${GLOSSARY}

بيانات المزرعة:
${JSON.stringify(summary, null, 2)}`;
}
