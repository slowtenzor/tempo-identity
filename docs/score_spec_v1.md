🟢 UI / индексер (без контракта)
🟡 требует событий в контракте
🔴 требует новых методов / storage

🎯 Цель

Уйти от фейкового Trust Score 50/100
и перейти к Reputation Signals Model (v1):

Никакой “магической цифры”.
Только прозрачные ончейн-сигналы + gated feedback.

⸻

1️⃣ Что УБРАТЬ / ПЕРЕИМЕНОВАТЬ

❌ Убрать
	•	Trust Score 50/100
	•	Average Score (в текущем виде)
	•	Любую единую агрегированную цифру

🔁 Переименовать вкладку

Reputation → Signals

(потому что сейчас это не репутация, а набор сигналов)

⸻

2️⃣ Новая структура вкладки “Signals”

🔷 Блок 1: Activity (он-чейн факты)

Показывать 4 карточки:

Метрика	Источник	Требует контракт?
Total Receipts	receipt events	🟡
Unique Clients	distinct payer	🟢
Total Volume	receipt amount sum	🟡
Total Tips	tip events	🟡

UI:

Activity
--------------------------------
Receipts         12
Unique Clients    5
Volume           134.2 USDC
Tips               3

⚠️ Если receipt уже отдельная сущность в Tempo — нужно только слушать событие.

⸻

🔷 Блок 2: Feedback

Показывать:
	•	Total Feedbacks
	•	Average Rating (если есть оценки)
	•	% Staked Feedback (если внедрите stake)

И таблицу отзывов.

⸻

3️⃣ Feedback модель (MVP)

⚠️ ВАЖНО: gate через receipt

Feedback можно оставить только если:

receipt.agentId == thisAgent
receipt.buyer == msg.sender
receipt.usedForFeedback == false

После отзыва:

receipt.usedForFeedback = true

🔴 Это требует storage в контракте:
	•	mapping(receiptId => bool) feedbackUsed

И метод:

submitFeedback(receiptId, rating, tags, commentHash)


⸻

4️⃣ Контракт: минимальный Feedback.sol

🟡 События

event FeedbackSubmitted(
    uint256 indexed agentId,
    address indexed reviewer,
    uint256 receiptId,
    uint8 rating,
    bytes32 tagsHash,
    bytes32 commentHash
);

🔴 Storage

mapping(uint256 => bool) public receiptFeedbackUsed;
mapping(uint256 => uint256) public agentFeedbackCount;
mapping(uint256 => uint256) public agentRatingSum;

(если хотите считать среднее на чейне)

⸻

5️⃣ Tip модель

Если tips уже обычные переводы —
лучше сделать отдельный метод:

tipAgent(agentId, amount)

и событие:

event AgentTipped(
    uint256 indexed agentId,
    address indexed from,
    uint256 amount
);

🟡 Это нужно для нормального индексирования.

⸻

6️⃣ Таблица отзывов (как у тебя сейчас)

Колонки:

| Client | Rating | Tags | Stake | Receipt | Date |

Убрать:
	•	Tag 1 / Tag 2 (заменить на массив тегов)
	•	Status → заменить на:
	•	Staked
	•	Unstaked
	•	Verified Receipt

⸻

7️⃣ Если хотите добавить минимальную анти-накрутку

Самый дешёвый вариант:

🔴 В feedback добавить stake:

submitFeedback(receiptId, rating, tags, commentHash) payable
require(msg.value >= MIN_STAKE)

И stake lock на N дней.

Никакого slashing.
Просто time-lock.

Это резко усложняет накрутку.

⸻

8️⃣ Как считать “Reputation Signals” (UI-логика)

Без контракта.

Пример:

Activity Score = log(totalVolume+1)
Client Diversity = uniqueClients
Engagement = totalTips
Satisfaction = averageRating

И показывать это не как 50/100, а как:

Reputation Signals
--------------------------------
✔ 5 Unique Clients
✔ 12 Completed Receipts
✔ 3 Tips Received
✔ Avg Rating 4.6

Без единой цифры.

⸻

9️⃣ Если хочешь оставить score

Тогда:

НЕ хранить в контракте.
Считать в индексере.

⸻

🔟 Что требует редеплоя

Обязательно, если хотите:
	•	submitFeedback(receiptId…)
	•	receiptFeedbackUsed mapping
	•	AgentTipped event
	•	AgentTipped method (если нет)

Если оставить только activity из receipt и не делать feedback — редеплой не нужен.

⸻

💡 Моя рекомендация (чтобы не утонуть)

Сделать v1 так:
	1.	Activity Signals (receipt + tips)
	2.	Feedback через receipt-gate
	3.	Без stake
	4.	Без score

Это чисто, честно и не притворяется алгоритмом.
