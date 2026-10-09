# Masterclass

This is the story of everything this project had to learn the hard way, written down so
nobody has to learn it twice.

A print shop makes an unforgiving teacher. It runs on physics you cannot argue with,
money that quietly drains in the wrong direction the moment you get a unit wrong, and
people in ink-stained gloves who will simply not use software that asks them to stop and
type. Nearly everything below was learned the same way: ship the wrong number, watch
what it costs, then go find out why.

If `README.md` is the user manual — what the system does today — and `NOTES.md` is the
diary — what broke, and how it got fixed — then think of this one as the professor. It's
where the actual lessons live, kept around long after the incident that taught them has
been forgotten by everyone who lived through it.

By now, those lessons add up to something you could measure: 187 separate trips back
into the database to fix or extend something, 163 little doors the software answers
questions through, 87 small rulebooks written in code, 75 different screens, and 1,058
automatic checks that all have to agree before anything new ships. None of that is the
point. The point is everything underneath it — so let's get into it.

---

# Part I · The physics of the shop

Forget "orders and statuses" — that's just the screen you happen to be looking at. The
real subject here is sheets of paper, trips through a press, the setup cost of getting a
machine ready, the paper that gets wasted along the way, and how many hours a machine
actually runs. Every one of those numbers is carrying a unit that's just waiting to be
gotten wrong — and in a print shop, wrong units aren't a rounding error, they're the
whole margin, walking out the door.

## 1 · Everything comes back to the sheet

There's a piece of paper called the **pliego** — the press sheet, the actual physical
sheet that goes through the machine — and it turns out that four completely different
questions all have the exact same answer hiding underneath them. How many products can
you fit on it? How much does that much paper weigh? What does printing it actually cost?
And if a customer ever calls asking where their box came from, which batch of paper did
it come out of?

All four of those questions come down to the same math about that one sheet. Which means
if you get that math wrong, all four answers go wrong together, in the same direction,
with absolutely no warning light telling you so. That's exactly what was quietly
happening here for a while: the part of the system that worked out the cost of a job and
the part that drew the little on-screen preview of how pieces fit on a sheet were doing
that math *separately* — two different calculators, asked the same question, sometimes
disagreeing with each other. Nobody had noticed until an audit went looking and wrote the
disagreement up under the name "OF-14." Since then, there's exactly one calculator for
this, and both the cost estimate and the picture on your screen read off the same answer.

And working out how many pieces fit on a sheet is genuinely trickier than it sounds. The
lazy way to do it — just divide the sheet's area by the piece's area — never survives
contact with a real press, because it ignores the strip along one edge that the machine
physically grabs onto and can never print on, ignores the extra sliver of margin every
piece needs around it, and ignores the fact that you can often fit more pieces by
rotating them sideways. Skip any of that, and the lazy math tells you 10 to 20 percent
more pieces fit on the sheet than actually do — which means it's telling you the paper
costs 10 to 20 percent less than it really does. That's not a wild swing that gets caught
right away. It's a quiet, steady lie, in exactly the direction that makes everyone feel
good about a quote right up until the job is finished and the real paper bill arrives.

## 2 · A trip through the press is not the same as a color

This one is, hands down, the single most expensive mistake this project ever shipped in
its numbers.

Picture a job that needs four colors on the front, printed on a press that lays down four
colors at once. That sheet makes **one trip** through the machine — all four colors go
down together, one pass, done. But for a while, the system was pricing that job as if it
took four separate trips, one per color. The result: press time was being overestimated
by as much as **4×**. Not a rounding error — an entire extra shift's worth of machine
time, invoiced onto every single job that happened to need more than one color, for
however long that math went unnoticed. The audit filed this one as "OF-15," and it's
worth sitting with for a second, because the fix is almost embarrassingly simple once you
see it: count how many colors are going on the front, divide by how many colors the
press can lay down in one trip, and round up. That's your number of passes for the front.
Do the same thing for the back, and add the two together.

A job printed on both sides, four colors each side, on a four-color press, is two trips
total — one for the front, one for the back. But a six-color job on that same four-color
press is *also* two trips just for the front alone, because the fifth and sixth colors
have to wait their turn and come back around for a second trip through the machine. One
small piece of code owns this exact question and nothing else, and a completely separate
part of the system — the one that figures out costs for a job that's only half-finished —
borrows that same answer instead of trying to work it out again from scratch.

## 3 · Getting the machine ready is a cost that doesn't divide up nicely

Before a single sellable sheet comes out of the press, the operator has already burned
through a stack of paper just getting the colors and the alignment right. Setting up for
a die-cut works the same way — there's a cost to getting the blade positioned correctly,
paid once, regardless of how many sheets follow it. And because that cost is paid once
per setup rather than once per sheet, two calculations that both *sound* perfectly
reasonable turn out to be wrong in opposite directions.

The first wrong answer is a flat allowance — say, "5% plus 50 sheets" of waste on every
job, no matter its size. That number starves a short run, where the setup cost is most of
what you're spending, and it pads a long run, where that same setup barely registers
against everything printed afterward.

The second wrong answer shows up when a job is only half-finished and the first half
moves on to the next step while the second half is still waiting. It sounds fair to split
the setup cost proportionally between the two halves — half the setup for the half that
left. It isn't. Here's the case that makes it obvious: say a 6,000-unit job needed 300
sheets just for setup, and half the run — 3,000 units — is ready to move on to the next
stage. That first half doesn't get charged 150 setup sheets. It gets charged all 300, plus
its share of the actual run — because the setup already happened, in full, before a
single good sheet came off the press. The second half, when its turn comes, doesn't pay
for the setup again — that machine's already been set up once, and it isn't getting set
up a second time. Split the setup cost proportionally instead, and the numbers claim the
first half of the job left the press with less paper than it actually needed to be
printed.

## 4 · Waste only means something once you compare it to the size of the job

There's a Spanish word for it — **merma** — but the concept translates instantly: it's
the paper that went into the machine and never came out as something sellable. It's the
single biggest cost a print shop actually has some control over, and every ruined sheet
is a small tragedy that got paid for three separate times: bought, printed, and it held
the press hostage for however long it took to print — and then sold for exactly nothing.

Two things had to be gotten right about how this number gets measured. First, the
percentage has to be measured against everything that went **in**, never against just the
good sheets that came out. That sounds like a technicality until you hit the edge case it
exists for: if a job is a total loss — every sheet ruined, nothing sellable at all —
dividing by the good output means dividing by zero, or reporting some nonsense number.
Divide by everything that went in instead, and a total loss correctly reports as 100%,
which is exactly what that situation deserves to be called.

Second — and this is the part that trips people up — the acceptable amount of waste has
to move depending on how big the job is, because that fixed setup cost from the last
section is hiding inside this percentage the whole time. A short run of 2,000 sheets or
fewer gets some real slack: up to 10% is considered normal, and even 18% isn't
automatically a red flag. A medium run, up to 20,000 sheets, tightens that down to 5%
normal and 10% as the outer edge. And anything longer than that has almost no excuse for
waste above 2.5%, with 5% as the ceiling before something is clearly wrong. Why the
difference? Losing 8% of a 500-sheet job is forty sheets — completely ordinary setup
waste, nothing to see here. Losing 8% of a 100,000-sheet job means something on that
machine is actually broken. One single threshold for every job in the shop would flag
every short run in the building for no reason, while completely missing every genuine
fault buried inside the long ones. And whenever waste gets added up across many jobs at
once, it's always weighted by how much paper each job actually used — never just averaged
job by job — because a 500-sheet job and a 100,000-sheet job do not deserve an equal vote
in that conversation.

## 5 · The two numbers that actually run the shop

Ask most people what a job's profit is, and they'll tell you the total dollar figure. That
number is almost useless for deciding what to actually run.

The first number that matters is **cost per thousand units** — the unit the whole
industry quotes in, because a total cost figure can't be fairly compared between a
5,000-unit run and a 150,000-unit run. The bigger job is always going to cost more in
total. That fact alone tells you nothing.

The second number is the one that actually decides what runs on the press Monday
morning, and — tellingly — it's the one that, for a long time, nobody in this project was
computing at all: **margin per hour of press time**. Here's why it matters. Imagine two
jobs on the schedule. One nets $400,000 in profit but ties up the press for eight hours —
that works out to $50,000 for every hour the press is running. The other nets a smaller
$200,000, but it's done in two hours — $100,000 an hour. Looked at as a total, job one
wins by a mile: twice the profit. But the press is always the bottleneck in a print
shop — there's only ever one of it, running one job at a time — and by that measure, job
two is the one you should be fighting to schedule first. Sort jobs by their total profit
instead of by profit-per-hour, and the schedule quietly fills up with big, comfortable,
slow-moving jobs, while the ones that actually pay the best get crowded out of a machine
that never has any spare time to give them.

## 6 · What an hour on a machine actually costs

For a while, the plant was carrying two completely different answers to a question that
sounds like it should have exactly one: what does an hour of running this machine cost?
One part of the system already knew, machine by machine, its energy use, its monthly
maintenance, and how much it was depreciating in value. A separate price list, used for
quoting jobs, was instead just quoting an hourly rate that someone had typed in once,
long ago, for reasons nobody could reconstruct anymore.

The fix was to derive that hourly number honestly from the machine's own real costs —
its energy use, plus its maintenance and depreciation spread out over how many hours it
actually runs in a typical month — and then hold that number up next to whatever the old
price list says, so any gap between the two becomes something you can actually *see*
instead of something quietly eating into margin in the dark.

That "typical month" figure was set deliberately low — 195 hours: one shift, five days a
week, 4.33 weeks in an average month. Spreading a fixed monthly cost over fewer hours makes each
hour look *more* expensive, not less, and in this business, quoting a job too cheap is
the mistake that actually draws blood. So the default leans toward the safer kind of
wrong. And for a long time this formula had nothing real to actually chew on — there was
no record of hours genuinely worked to plug into it — until a separate piece of the
system started capturing real hours from the shop floor, and the math finally had
something true to compare itself against.

## 7 · A person's wage has to come from a clock, not from someone's memory

There's a chain here that runs from a person, to their wage, to the machine they were
running, to the order that machine was working on — and every link in that chain already
existed somewhere in the system. What was missing was simply wiring them together. A
kiosk with a QR code captures when someone actually clocks in and out. A separate record
already tracks which person was assigned to which machine, on which shift, for which
order. A third record holds each person's hourly wage and overtime rate — and crucially,
holds the wage *that was actually true on that date*, not just whatever it is today.
Multiply those together correctly, and the answer lands where it belongs: on that order's
real cost.

That last piece — using the wage that was true on the date the work happened, not
today's rate — matters more than it sounds. Payroll for work done in March has to use
March's rate. A shortcut that just grabs "whatever the current rate is" quietly rewrites
history the moment anyone gets a raise, understating what every past job actually cost to
run.

And once that chain existed, it had to be taught to handle the shop floor as it actually
behaves, not as a spreadsheet imagines it does: an operator who forgets to clock out, a
double-punch on the kiosk, a night shift that crosses over midnight, one station juggling
several different orders in a single day. Every one of those real situations got decided
once, carefully, in one place — instead of being improvised fresh, slightly differently,
every single time one of them showed up somewhere new.

## 8 · Paper gets bought by weight and used up by the sheet

A supplier's invoice and a printing press speak two completely different languages. The
supplier bills by the kilogram, or by the ream. The press only ever consumes actual
sheets, one at a time. Translating cleanly between those two — how much does this many
sheets, of this size, of this exact paper weight, actually weigh in kilos — has to use
the sheet's dimensions and its grammage, and that conversion needs to be exactly right
and used consistently everywhere, because it's the hinge that the purchase order and the
cost estimate both swing on.

It's also the source of one of the more human bugs in this whole project's history.
Chilean invoices write fifty thousand as `50.000` — a period as the thousands separator,
not a decimal point. Read literally the way an English-speaking system normally would,
that number becomes fifty, not fifty thousand — a paper order that's off by a factor of a
thousand. It happened, it got caught, and the fix even carries the bug's name directly
into its own history, in a file literally called `20260817140000_50_000_no_son_cincuenta_mil`
— "50.000 isn't fifty thousand," naming the exact wrong assumption that caused it.

## 9 · Traceability has to be a physical chain, not just a log file

The food-packaging safety certification this shop operates under — it's called FSSC
22000 — doesn't just want a written record somewhere. It wants an answer on the spot, to
a very specific question: *here's a box sitting on a supermarket shelf right now — show
me exactly which batch of paper it was printed on, the purchase order that bought that
paper, the certificate that was valid on the day it was actually used, and a photo of
what genuinely shipped.*

Being able to answer that on demand, instantly, forces a real chain of physical facts,
each one written down at the exact moment it actually happens rather than reconstructed
afterward from memory. Start at a batch of paper. That batch has a purchase order behind
it. The purchase order names a supplier. The supplier's paperwork should carry a
certificate. Now walk the same chain the other direction: that batch of paper got used up
by a specific job, on a specific date, in a specific quantity, logged by a specific
person. That job produced a shipment. The shipment is tied to a delivery note, and the
delivery note is tied to an invoice.

There's exactly one door in the entire system that's allowed to record paper actually
being used up, and it checks four things at once, in a single indivisible motion:
whether the record's retention rules are respected, whether there's actually enough paper
left in that batch, whether someone else already has a competing claim on it, and whether
the certificate on that batch is still valid. That single-door design matters because a
second, quieter path that could write the same kind of record without those same checks
would make the *entire* chain unprovable — one honest door and one side door left
unlocked is functionally the same as having no door at all.

Two things follow directly from that. First, every single way someone can report using
paper — a scan at a machine, or now, a photo texted in from a phone — has to go through
that same one door. The photo just replaces the keyboard; it doesn't get to skip a single
rule the keyboard would have had to follow. Second, a deviation from the rule isn't
automatically forbidden — sometimes using a batch whose certificate technically expired
yesterday really is the right call to make, because the job can't wait — but making that
call has to leave a written trail: who authorized it, and why, attached directly to that
transaction. A rule with absolutely no room for a legitimate exception is exactly the kind
of rule people learn to quietly work around instead of following.

Worth noting separately: *reserving* paper for a job is deliberately kept apart from
*actually using it up*. A reservation never touches how much paper is really available —
it only limits what the system is honestly allowed to promise someone else — and it
expires on its own if nobody follows through, so a job that falls apart releases its
claim on that paper automatically, without anyone having to remember to go do it by hand.

## 10 · The one where we admit we haven't fixed it yet

This one stays in here on purpose, because it's unfinished, and that's exactly what makes
it worth reading.

A guillotine — the big blade that trims stacks of paper — doesn't cut one sheet at a
time. It grabs a whole stack, called a "lift," of roughly 500 sheets, and cuts through the
entire stack in a single stroke. For a while, the system priced guillotine time as if it
worked through paper continuously, sheet by sheet, the same way a printing press does.
Costed that way, a cut of 25,770 sheets came out to 8.9 hours of guillotine time — when
the real number, on the actual shop floor, is one to two hours.

The immediate fix expresses the guillotine's real speed — lifts per hour — using the same
"sheets per hour" units everything else in the pricing table already uses, so nothing
else in the system had to change shape to accommodate it. But the underlying number that
feeds the actual machine schedule still carries the exact same flaw underneath, and fixing
that one properly means adding a genuinely new piece of information — how many sheets fit
in one lift — that doesn't exist anywhere yet. Patching around a wrong assumption instead
of removing it is still a debt. The only honest thing to do with a debt like that is write
it down in plain sight, so nobody mistakes the patch for the real fix.

---

# Part II · The habits that keep it honest

Nothing in this section is really about code. It's about running an operation full of
real people, real machines, and real deadlines, and making sure the rules you write down
actually get followed — instead of quietly worked around by the first person who finds
them inconvenient. It just happens that here, those habits are enforced by software
instead of by a supervisor's memory.

## 1 · Tell people exactly what's missing

Every single point in this system where work gets blocked has to say, specifically, what
it's waiting on — never a vague label standing in for the actual answer.

These are two real messages the system actually shows, before and after this lesson was
learned. The old one: *"Ficha incompleta"* — "the job sheet is incomplete." The one that
replaced it: *"Faltan 3 datos para poder mandar la prueba: montaje confirmado, arte
adjunto, operaciones revisadas"* — "three things are missing before this proof can go
out: the layout hasn't been confirmed, the artwork hasn't been attached, and the job's
operations haven't been reviewed." Same story with a different gate. Old: *"No se puede
despachar"* — "this can't be shipped." New: *"No se puede despachar con la pasada por
Troquelado sin cerrar. Falta decir cuántas horas tomó — se puede desde el tablero, o el
operario lo manda por WhatsApp"* — "this can't ship because the die-cutting step was
never closed out — someone needs to say how many hours it took, either from the planning
board or by texting it in."

A message that names the actual gap can be acted on immediately. A vague category just
sends the person reading it off to go hunting for whatever's actually wrong. The second
version of each example also says exactly *where* to go fix it — and that's the real
difference between a rule and a trap wearing a rule's clothes.

## 2 · Block the impossible, never block the merely unfinished

This might be the hardest call the whole project ever had to make — and it's a lesson
that has nothing to do with software at all.

If you build a system that refuses to let anyone move forward until every field is
perfectly filled in, you haven't actually made the missing information appear. All you've
done is push the real work of the shop *outside* the system — because the shop keeps
running regardless, deadlines don't wait for a form, and now the only thing that's
actually stopped is your own record of what's happening. So the rule that emerged was
this: **moving a job forward is never blocked. Closing it out completely is.**

Any single step is free to hand a job off to the next one carrying nothing at all, if
that's genuinely the state it's in. Whatever's missing just stays visibly open — an
unmissable colored ring right on the job's card — until someone actually finishes it.
There was already a rule that a job couldn't be marked ready to ship without real costs
attached; it simply gained one more condition alongside that: no step left dangling open
behind it.

The same checker turns hard exactly where it should. If someone types 480 into a field
asking for hours worked, that gets flatly rejected — not because filling in hours is
mandatory, but because 480 is almost certainly someone typing minutes into a field that
wanted hours, and a wrong number that looks perfectly plausible will quietly poison both
that job's cost and that machine's entire historical average going forward. A blank is
easy to spot and easy to fix later. A confidently wrong number has to be caught in the
act, right now, or it never gets caught at all.

**Be strict about the impossible. Be forgiving about the merely unfinished.** And any
time a rule does stop someone, there has to be an actual door standing right there for
them to walk through and comply — telling someone to "go close out the die-cutting step"
without showing them anywhere to actually do that isn't a rule at all. It's a trap
wearing a rule's clothes.

## 3 · Never let the same fact live in two different places

At one point, this system had **seven different, separately stored** answers to a single
question: where, physically, is this job right now? A status field. Five different
on/off switches with their own separate names. A "what stage is this in" field. Plus the
machine's own printed schedule, a WhatsApp conversation someone was tracking by hand, and
a separate shift-assignment table that happened to also imply an answer. None of those
seven answers was actually calculated from any of the others — so naturally, over time,
they quietly drifted apart, and nothing was watching closely enough to notice when they
started disagreeing with each other.

The rule that came out of that mess is almost embarrassingly simple to say out loud: if
one fact can be *worked out* from another fact that's already recorded somewhere, work it
out — don't store it a second time. One part of the system, for instance, doesn't have a
separate "is this open or closed" field at all anymore, because "open" simply *is* "the
hours field is still blank." A second place to say the same thing is just a second place
for that thing to eventually start lying.

The flip side matters just as much, though: knowing when *not* to collapse two things
into one. Hours worked and the money they're worth are kept as two separate facts,
deliberately, because money is just hours multiplied by a wage rate — and that rate
changes over time. Keeping the raw fact (hours) separate from its dollar value is exactly
what lets you go back later and recalculate cost correctly, without ever having to rewrite
the shop's actual history of what really happened.

## 4 · When you need to know the truth, ask the source directly — don't just search for it

Here's a genuinely sneaky failure mode. The database has its own little stored recipes —
small programs that live inside it and get run when certain things happen. If you delete
a column those recipes happen to reference, the database doesn't check whether that
breaks anything at the moment you delete it. It only actually reads a recipe's
instructions the moment someone tries to run it — which means a broken recipe can sit
there, completely undetected, sailing straight through every deploy, every automated
check, every test that exists — right up until the very first time a real person actually
triggers it, at which point it fails in production with a customer waiting.

Just searching through the project's code for the deleted column's name won't catch this,
because those recipes live tucked inside the database itself, invisible to a normal text
search. But you can ask the database directly, in its own language, a question along the
lines of: "of all the recipes you're holding onto, which of them still mention an
ingredient I no longer stock?" — and it will tell you, honestly, every time. The same
blind spot shows up in reverse, too: if a piece of code asks the database for "column A,
column B, column C" as one long piece of text, and column C stops existing, a normal type
checker sees nothing wrong at all — to it, that's just a string of text, not a real
reference to anything. Everything stays green, right up until that exact request runs for
real and quietly fails.

## 5 · A permanent tripwire beats a one-time fix, and a rule nobody automated isn't really a rule

If you find the same mistake made thirty separate times across a codebase and go fix all
thirty by hand, you haven't actually removed the pattern that caused them — you've just
delayed mistake number thirty-one. What actually worked here, instead of thirty individual
corrections, was building three permanent tripwires: one that automatically flags a
particular kind of careless mistake the moment anyone tries to write it again, one that
puts a safety net underneath every single screen so a certain category of error can never
silently fail without at least being visible somewhere, and one script that lists, every
time it runs, every case where the same rule got accidentally written down twice in two
different places.

And then there's the lesson that took a *fourth* incident to actually sink in properly.
The exact question from the previous section — "which recipes mention an ingredient we
no longer stock" — had already been figured out once, wr itten down carefully, and even
pasted directly into a comment inside the project as a reference for next time. The exact
same mistake happened again anyway. Not because the answer wasn't known — because knowing
the answer and writing it down isn't the same thing as a rule that actually runs itself.
So it stopped being a comment and became a script that runs automatically instead.

A lesson genuinely isn't learned until something *other than a person* is responsible for
remembering it.

## 6 · A watchdog that barks at everything gets turned off — and then you have no watchdog at all

The tripwire mentioned above — the one that checks whether a database recipe still refers
to something real — only ever reports a problem when it can trace a reference back to an
*actual, concrete* table. Anything it can't confidently tie back to something real, it
stays quiet about, completely on purpose.

Here's why that restraint matters. The easy, naive version of a check like this — flag
any word that isn't a column name it recognizes — does correctly catch every real problem.
It also, in the very same breath, falsely accuses roughly two hundred things that were
never actually broken. And even the far more careful version that eventually replaced it
still cried wolf twelve separate times on its very first run. The fix wasn't to just turn
down its sensitivity until it stopped complaining so much — it was to make the tool
actually understand the situation better: it turned out one particular recipe legitimately
serves two different tables at once and figures out which one it's currently dealing with
on the fly, so a reference should only count as broken if it doesn't belong to *either*
of them.

**Precision matters more than raw coverage, for anything you actually want people to
trust.** A check that only ever flags real problems survives and gets used. One that
technically catches more but also cries wolf constantly gets disabled within a month by
someone tired of ignoring it — and then you're right back to having no protection at all,
just with a comforting illusion that something is watching.

The same principle applies to a problem you genuinely can't fix today. One broken recipe
in this system is *still* broken right now, because fixing it properly requires an actual
business decision, not just a rename. Leaving it flagged as an error forever would mean
the check is permanently red — and a check that's permanently red is really just a slower
way of saying "deleted," since everyone eventually learns to ignore it. So instead, its
specific references are individually named on a written exceptions list: printed out
every single time the check runs, deliberately excluded from making the check officially
fail, and — critically — anything *not* already on that list still turns the whole check
red. A list that has to spell out, by name, exactly what it's choosing to forgive is
documentation. A blanket setting that quietly hides the exact same problem is just
amnesia wearing a lab coat.

## 7 · When replacing something, write the new copy down before you erase the old one

The obvious order for replacing a set of records is: delete the old ones, then insert the
new ones. That order also happily loses the old data forever the moment the insert step
fails partway through.

Flip the order around instead — write the new rows in first, and only delete the old ones
after that succeeds — and a failed insert now leaves the old data completely untouched
and intact. The worst thing that can go wrong becomes a handful of visible duplicate
rows, never silent, permanent loss. Duplicates can always be cleaned up and reconciled
later. Data that's simply gone cannot. Whenever you have a choice, pick the failure you
can actually recover from.

## 8 · Only overwrite something if it's still in the exact state you last checked

Between the moment you look at a record and the moment you write your change back to it,
someone else can walk in and change it first. The way to guard against that is to make
your update only take effect if the record is *still* in the exact condition you checked
a moment ago — for instance, only update this job if its status is still exactly what you
last saw it as.

If zero records match that condition when you go to save, that means someone else beat
you to it — and the right response is to back off and say so, not to barrel ahead and
silently overwrite whatever they just did. The same trick closes a similar gap somewhere
else entirely: a supervisor standing at the planning board and an operator texting in from
the shop floor can genuinely try to close out the exact same step at the same moment, and
this is what stops one of them from silently erasing the other's version of events.

## 9 · If the screen is going to lie to you for a moment, it needs a way back to the truth

The job board updates the instant you drag a card — it doesn't wait around for the server
to confirm anything first, because waiting would make every single action on that board
feel sluggish. That trick only actually works, though, if it can cleanly undo itself the
moment the server comes back and says no.

Doing that reliably takes four steps: take an actual snapshot of exactly how things looked
right before you touch anything; show the new, hoped-for state immediately; ask the server
in the background whether that change is actually allowed; and if the answer comes back
no, restore the *exact* snapshot you took a moment ago, and say plainly why the change
didn't stick.

The step people skip, almost every time, is the first one — actually keeping a snapshot
of the "before" around. Trying to reconstruct what things looked like before, by working
backward from the new state after the fact, is guessing dressed up as engineering. Simply
holding onto the real, actual previous value is just... remembering it.

## 10 · A number that's silently missing most of the data is worse than an error message

The layer that hands data back to the rest of the system has a limit: it will only ever
return, at most, one thousand rows in a single answer — and it does **not** tell you when
it has quietly cut things off there. No error, no warning flag, nothing. A response with
exactly a thousand items in it looks, in every way that matters, identical to a response
that has everything — right up until the moment it very much isn't the same thing at all.
A query can work flawlessly for the first month a shop is live, and then, the moment
enough real history piles up behind the scenes, start quietly lying without anyone
noticing anything had changed.

This exact gap once caused a profitability screen to add up only 1,000 of the 4,256 real
cost records that actually existed, and confidently present that partial sum as the
complete picture. The number on screen said the shop was earning 82% margin. The real
number, once every record was actually counted, was 22%. The reported cost was roughly
$809 million; the true figure was closer to $3.28 billion.

The fix now keeps fetching, page after page, until it has genuinely gathered everything —
and, just as importantly, it explicitly flags when it hit its own safety ceiling along the
way. That one small flag is the entire difference between confidently telling someone
"your shop earned 22% this month" and honestly telling them "here's part of the answer,
and I genuinely don't know yet how much of the picture I'm missing."

## 11 · Be most suspicious of the errors that make you look good

Look again at which direction that last mistake pointed: quietly dropping most of a
shop's real costs makes its margin look *better*, not worse. And that's exactly the
danger. Nobody, anywhere, ever files an urgent bug report about a number that made their
day better.

A screen reporting 100% margin isn't a cause for celebration — it's almost always an
unfinished account waiting to be noticed, not an actual triumph. The right instinct for a
screen to have is to say, out loud, in plain words, something like *"59 jobs have no
recorded cost yet"* — rather than quietly averaging those jobs in as though they cost
nothing at all, and letting a hollow number pass for good news. Build the habit of asking
this question about literally every single metric anyone puts in front of you: **which
direction does this number fail in, and would anyone even notice if it did?**

## 12 · Many doors are fine. Each door writing its own separate diary is not.

A job can get moved forward from the planning board, from a scheduling screen, from a
scan at the machine, or from a text message sent in from someone's phone. Having four
different doors like that is exactly correct — a shop full of real people on a real floor
is never going to stop and gather around one single screen just because the software
would prefer they did. What's actually wrong is those four doors each quietly writing
their own version of the truth straight into four different places.

The fix is to route every single one of those doors through one shared inbox first, and
have exactly one translator read everything that lands in that inbox and be the only
thing allowed to actually update the official record. A few things follow naturally once
you set it up that way, and they end up mattering more than the plumbing itself. No door
is allowed to demand information that rightfully belongs to a completely different door —
the planning board, for instance, has no business insisting on a pallet scan before it'll
let a job move, because there's already a dedicated scanning screen for exactly that, out
on the floor, built for someone wearing gloves who has zero patience for a pop-up window.
Every door leaves the same kind of trace behind, including its outright failures — a photo
that couldn't be matched to an order is, if anything, the single most important one for a
supervisor to actually see, and only ever recording the successes just leaves that problem
silently trapped forever on whoever's phone sent it in. And every door reuses the exact
same set of validated rules rather than quietly running its own parallel version of them —
a job moved by a text message goes through the identical set of checks that a supervisor's
drag-and-drop on the board does, because the moment one path can update the record
directly without going through those checks, literally every rule in the system becomes
conditional on which door happened to get used that day.

## 13 · How confident something is should decide who handles it

The part of the system that reads incoming text messages has been scoring its own
confidence — zero to a hundred — in what it thinks a message means, since the very day it
was first built. For a long stretch, though, nothing actually *used* that number for
anything. It turns out to be exactly the right input for deciding a much more useful
question: should the system just go ahead and apply this on its own, or should a person
look at it first? Reading that one number lets a single pipeline handle both situations
cleanly, instead of needing two separate, forked versions of the same logic.

Where exactly to draw that confidence line came down to weighing two different kinds of
mistake against each other, not to picking a number that simply felt right. Moving a job
to the wrong column is cheap and easy to undo — a rollback fixes it in a second. Recording
the wrong number of hours for a step, on the other hand, poisons both that job's cost
*and* that machine's entire running average going forward, and that's much harder to
untangle after the fact. So the whole system got gated at the same single number — 70 —
because the more expensive mistake is the one that has to set the bar for everything,
including the cheap ones.

## 14 · Work out the answer from what's already known before you ever ask a person

A photo texted in from the warehouse floor can tell you exactly *which* pallet it shows.
It cannot, by itself, tell you *which order* that pallet belongs to. The lazy fix — just
text back and ask — puts a real person right back in the exact spot the system was
supposed to be helping them skip. But most of the time, the answer to that question is
already sitting somewhere else in the system, just not written on the label itself. So
the logic climbs a short ladder, trying the most certain, most specific answer first: is
the order actually written on the label? If not, is there a live reservation already
holding that specific batch for one particular job? If not, does an active purchasing
requirement already point at this exact batch? And if none of that resolves it, is there
genuinely only one order sitting in storage that this could plausibly belong to?

The instant more than one real candidate survives that ladder, the system stops guessing
and asks a person directly — but it asks a genuinely easy question, listing the two or
three actual candidates by name so the reply back can be five digits, not an entire
paragraph. Guessing wrong here would be strictly worse than just asking, because logging
paper against the wrong job doesn't just create a small clerical error — it makes the
whole traceability chain confidently, convincingly point at the wrong batch of paper. And
a confident wrong answer is exactly the one kind of mistake a real product recall cannot
survive.

## 15 · Keep the actual thinking separate from all the plumbing around it

Every rule in this system that genuinely matters lives inside its own small, self-
contained piece, completely disconnected from any database or network call. Everything
else — every screen, every server route — exists only to go fetch the information those
rules need and hand it over, then take the answer and do something with it.

Splitting things up that way pays off in three separate ways, all for free. Each rule can
be tested entirely on its own, with no real database or server needed to check it. The
exact same rule runs both inside the form someone fills out in a browser and inside the
server's own final check — so those two places are structurally *incapable* of ever
disagreeing with each other, because they're not two versions of the rule, they're the
same rule. And the genuinely gnarly, hard-to-get-right edge cases get worked out once, in
one clear, readable place — instead of getting silently reinvented, slightly differently
each time, inside whatever part of the code happened to need an answer that particular
week.

There's a useful tell for spotting when a piece of logic has drifted somewhere it
shouldn't be: one module that reports on a job's progress deliberately takes a small
labeling function as an input, handed to it from outside, rather than just reaching out
and grabbing the "proper" label wording directly for itself. That's on purpose — that
module gets reused on the server, where none of the screen's own labeling logic should
ever need to live, and giving it a hard, built-in dependency on how things get displayed
on screen would quietly tie a supposedly neutral rule to one particular side of a wall
that's meant to stay up.

## 16 · Actually measure it before you pick a limit out of thin air

A tool that reads QR codes out of photos needed some kind of ceiling on how big a photo
it would even attempt to look at. The first guess at that ceiling — 64 megabytes — turned
out to reject completely ordinary, real photos straight from someone's phone, and it did
so while confidently telling them *"the code isn't visible in this image"* — a
technically true-sounding answer to a completely different question than the one that was
actually happening.

So instead of guessing again, the real numbers got measured directly: a photo roughly
2000 pixels wide can balloon out to 128 megabytes once it's fully unpacked in memory for
processing; at 3000 pixels, that's 192 megabytes; at 4000 pixels, 384 megabytes. And 384
megabytes of memory, held briefly inside the kind of small, temporary process that
actually handles this, is exactly the situation that reliably kills that process outright
mid-request. So the real limit that got chosen was framed around megapixels instead of raw
file size — about 9 megapixels — and it gets enforced by peeking at just the image's
header information *before* trying to load the whole thing into memory, so an oversized
photo gets rejected cheaply, before it can do any damage. And the rejection message itself
says something a real person can actually act on: *"send it as a photo, not as a file —
WhatsApp will shrink it for you."*

Three separate lessons are really stacked inside that one small fix: measure the real
numbers instead of guessing at them; check something cheaply *before* you commit real
resources to it; and make sure the error message points at a choice the person reading it
genuinely has the power to make.

## 17 · Write down the *why*, and be honest about the scar it's covering

The habit that runs through this entire codebase: a note left in the code should never
just restate what the code visibly already does. It should record the actual decision
that was made, and specifically what breaks on the day someone decides to reverse it.

Take one real example, straight out of the code, exactly as it's actually written:

> `?? undefined` y no `?? []`: una lista vacía significaría «no falta nada» y dejaría
> pasar cualquier OT. Sin dato, la compuerta no corre.

In plain English: "default to nothing at all, not to an empty list — an empty list here
would quietly mean 'nothing is missing,' and that would let any job slip straight through
this checkpoint. With no data at all, the checkpoint simply refuses to run." That one
sentence is the entire difference between a future engineer understanding a rule and that
same engineer confidently "simplifying" it straight back into the exact bug it was
written to prevent in the first place.

Every single change made directly to the database opens with the actual problem it's
solving, written out in plain language, in the shop's own words. That's not decoration —
it's the thing standing between the next person and the very natural instinct to clean up
a safeguard that looks unnecessary, purely because the story behind why it exists was
never written down anywhere they could find it.

## 18 · Practice data has to be allowed to catch you out

Building a realistic set of demo data isn't a shortcut to get a convenient test fixture —
it's a genuine stress test of the whole system's actual rules. Building out roughly four
months of history, about 260 orders, and 1,700 individual shifts surfaced eight real
constraints in the system that nobody had run into yet, purely because writing rows down
the honest way, one at a time, makes the database loudly object the moment something
genuinely doesn't add up.

The best of those eight: actually reading one particular compliance rule carefully,
*before* writing a single row of demo data, revealed that it was measuring the length of
someone's entire shift — not how many hours they'd actually logged as worked. Which meant,
completely by accident, that the system believed no person could ever legitimately accept
more than exactly one work assignment in a single day. Catching that by reading the rule
first meant it got fixed calmly, on paper, before it ever touched real data. Finding the
exact same problem the other way around — writing the data first and only reading the
rule afterward — would have shown up instead as a half-finished, broken database and a
completely cryptic error message with no obvious story attached to explain where it
actually came from.

## 19 · Telling the type checker what something is doesn't make it true

There's a very particular kind of lie that's easy to tell by accident: writing down, in
your own code, exactly what shape some piece of data is — and having the type checker
believe you completely, because you're the one who told it. A job board let someone drag
a card from one column to another, and the very first thing that happened afterward was:
grab whatever's currently cached under the label "all the orders," and update just the
one that moved. The code doing the grabbing said, in effect, "this is going to be a plain
list of orders" — and the type checker nodded along, because nothing about writing that
sentence down is actually false as far as it's concerned.

It just happened to be wrong. What was actually sitting under that label wasn't a plain
list at all — it was a small wrapped parcel: the list, plus a total count, plus a flag
saying whether the list had quietly been cut short. That wrapping had been added on
purpose, specifically so nothing downstream would ever mistake "here are the first two
hundred rows" for "here is everything." But the one piece of code dragging a card across
the board had been written before that wrapping existed, and nobody had gone back to
update its own private assumption about the shape of what it was reaching into.

The result was about as quiet as a bug gets. Asking the wrapped parcel to behave like a
plain list failed immediately and loudly inside the code — but it failed *before* the
part of the function that would have actually talked to the server, so nothing ever got
sent, no error ever reached the screen, and the card just slid back to where it started.
It looked, to absolutely anyone watching, like they'd simply missed the drop zone by a
few pixels. The entire feature — moving a job forward or backward on the board — had been
completely unreachable, and the single most visible symptom of that was a UI that looked
exactly like "try again, you missed."

The fix is almost beneath mentioning: unwrap the parcel correctly, update the list that's
actually inside it, and hand back the same wrapping shape. The lesson underneath it is the
one worth keeping. A type annotation on a piece of code that reads some shared, remembered
value is not a promise that anything checked — it is a promise *you* made, on behalf of
whatever actually produced that value, and the type checker's only real job in that moment
is to make sure the rest of your own sentence is internally consistent, not that the
sentence itself is true. The actual shape of a shared value belongs to exactly one place:
whoever originally decided to go fetch it and store it that way. Every other piece of code
reaching into the same spot is working from a copy of that decision it never actually
verified — and if the original shape ever changes and even one of those copies doesn't get
the memo, the type checker will wave everything through without blinking, because as far
as it's concerned, nothing it was ever told checking turned out to be false.

---

# Part III · The toolbox, and what it taught us

Every piece of technology this project leans on came with its own personality, and every
one of them eventually taught a real, expensive lesson the hard way. Here's the toolbox,
introduced properly.

## Postgres — the filing cabinet everything actually lives in

If every tool in this stack were a teacher, Postgres — the actual database, the giant,
meticulous filing system holding every fact this project knows — would be the strictest
one by far, and also, in its own way, the most honest.

It taught, among other things: that you can only ever *add* new columns to one of its
saved views, never neatly reorder them — so a new field always lands wherever the
database's own internal bookkeeping decides, not wherever would read most naturally.
That a column set up to calculate itself automatically means your arithmetic has to run
in reverse whenever you're loading in practice data — figuring out a starting price from
a stored total, instead of the other way around. That its row-level privacy rules can
hide entire *rows* of information from someone who shouldn't see them, but genuinely
cannot hide a single *column* inside a row someone's otherwise allowed to look at — which
means protecting one sensitive piece of contact information takes an entirely different,
more surgical kind of permission setting. That its little stored recipes are only checked
for correctness the moment they actually *run*, not the moment they're written — which is
exactly the mechanism behind the deleted-column problem from earlier. That a piece of
code counting something can be quietly counting something slightly different than you
assumed, so it's worth actually reading a rule's fine print before writing data through
it. And that when it copies the shape of a row for you to work with, it copies that shape
fresh, at the exact moment the code runs — convenient day to day, and also precisely why
a reference to something that no longer exists can survive completely undetected through
an entire deployment.

A few more of its habits get used here on purpose: certain especially sensitive
operations are locked down so that only the system itself, never an ordinary logged-in
user, is allowed to run them at all. Certain rows get locked briefly while they're being
read specifically to stop two requests from racing each other and both believing they
went first. Certain lookups are kept fast by only indexing the small, specific slice of
data a particular check actually cares about, rather than the whole table. Certain rules
are enforced twice on purpose — once in the website's own code, and again as a hard
constraint inside the database itself — precisely so a rule can't be quietly bypassed by
going in some other way. And rather than allowing any old text for something like a
status, the database is told the fixed, exact list of valid options up front, so a typo
turns into a loud, obvious error instead of a silent, invisible mismatch nobody notices
until much later.

One habit is worth calling out entirely on its own, because it's less a technical trick
and more a genuine philosophy: certain historical records in this system can be created
and read, but they cannot ever be edited or deleted afterward — not by anyone, not for
any reason, at the database level itself. Evidence that can quietly be edited later isn't
really evidence at all. It's a diary with an eraser built right into the spine.

## Supabase — the front door on top of that filing cabinet

Supabase is the service that wraps that same database with a friendlier web-facing front
door, plus a login system and file storage bundled in alongside it. The two lessons worth
carrying around from it forever: the thousand-row ceiling from earlier in this document,
and the fact that when code asks it for a specific list of fields by name, that entire
request is just plain, invisible text as far as any automated checker is concerned. The
project's own internal map of the database's shape gets completely regenerated after
every single change to the database for exactly that reason — so a mismatch between what
the code expects and what the database actually has becomes an error the moment code is
written, in the one place it's actually still possible to catch it cheaply.

## Next.js, React, and TypeScript — the actual website

This is the framework and the language the whole application is actually built in. Its
type checking is genuinely excellent at catching a whole category of mistakes — shapes
that don't match, values passed to the wrong place — and it is completely, structurally
blind to any problem that's expressed as a plain piece of text, which turns out to
describe most of the truly interesting failures in this document.

There's a memorable cautionary tale attached to it, too: one particular build setting
once broke the live deployment process outright, while the *already-running* website
kept right on serving the last version that had actually worked — quietly hiding the fact
that every single change pushed since then had silently failed to go live at all. A
passing check on a build configuration that production doesn't even actually use is worse
than having no check at all, because it's actively lying to you about being one.

## TanStack Query — the layer that remembers what the screen already asked for

This is the piece that manages what a screen has already fetched and remembered, so it
doesn't have to go ask the server the exact same question over and over again. It's what
makes the instant-undo trick from Part II possible, and there's also one single safety
net sitting quietly underneath every screen in the whole application, catching a whole
category of error that individual screens never got around to explicitly checking for
themselves.

## Zod — the doorman at the front entrance

Zod checks that incoming information is at least the right *shape* the moment it arrives
at the door — the right kind of value, in roughly the right range — before anything more
serious even looks at it. It's worth being precise about the difference between that and
the *real* rules further inside: an hours-worked field, for instance, gets capped at
999,999 by Zod purely to stop something absurd from ever reaching the database at all,
while the real, meaningful limit — 400 hours in one go — lives entirely inside the actual
business rule, deeper in. That distinction matters because Zod's own rejection message
reads, generically, something like *"the number must be less than or equal to 400,"* and
never once actually tells anyone that what they really typed in was minutes, not hours.
The doorman can tell you a number's out of range. Only the rule further inside actually
understands what that number means.

## Vitest — 1,058 small, fast promises that keep getting checked

This is the tool that runs the project's automatic tests — 1,058 of them, spread across
67 files, and the overwhelming majority of them aimed squarely at the pure rules from
Part II.15. They run fast for a genuinely simple reason: nothing in them fakes a database
connection, because the rules that matter most in this whole system never touch one in
the first place.

Even the tests' own names carry real meaning, written out in the shop's own everyday
language rather than in technical jargon. Three real ones, exactly as they appear when
the tests run:

> ✓ el arreglo de un tiraje corto no dispara nada
> ✓ una etapa con dos pasadas abiertas se nombra una vez
> ✓ nadie tiene dos turnos el mismo día

Which read, in order: "fixing a short run doesn't accidentally trigger anything it
shouldn't," "a stage with two open passes only gets named once," and "nobody ends up with
two shifts assigned on the exact same day."

And for the one piece of this system whose correctness genuinely can't be reasoned about
just by thinking hard about it — the tool that reads QR codes out of photos — the tests
actually generate a real QR code, save it as a real compressed photo exactly the way a
phone would, bury it inside a larger 3000-pixel image the way a real photo would look, and
then genuinely try to read it back out again. **A decoder that's never actually been
tested by decoding something real is a decoder nobody has actually run.**

## Meta's WhatsApp system — how a shop-floor phone talks to the system

This is how messages sent from an ordinary phone on the shop floor actually make it into
the system at all — the free option, chosen only after the first company approached for
this rejected the account outright. In roughly the order these lessons got expensive:
always answer back immediately with a plain acknowledgment the instant a message arrives,
because if you don't, Meta assumes something went wrong and helpfully resends the *entire*
batch of messages all over again — including every single one that had already gone
through perfectly the first time. A photo doesn't arrive as an actual file — it arrives
as an ID number that then has to be separately exchanged for a real, temporary download
link, using the same access credentials all over again. And a photo sent in without any
caption text attached to it has, technically speaking, no message body at all — which for
a while meant the system simply dropped it, discarding the single most natural, most
common thing anyone standing in a warehouse actually does with their phone.

## Reading barcodes out of photographs

The actual barcode-reading is handled by three small, plain JavaScript pieces that need no
special native software installed alongside them — genuinely convenient, low-drama
choices. A completely different, much heavier image tool still quietly sits inside the
project regardless, purely because a different piece of software the project depends on
happens to pull it in automatically on its own. Relying on something that showed up
uninvited like that is a quiet risk all its own: the day that other piece of software
stops including it, nothing anywhere will give any warning before production actually
breaks.

One genuinely counter-intuitive detail worth remembering on its own: when a photo needs
to be shrunk down before processing, the shrinking is deliberately done using the
crudest, blockiest method available, rather than a smoother, prettier one that blends
pixels together. Smoothing produces a nicer-*looking* image to a human eye, and a
measurably *worse* one for a barcode reader — because smoothing is precisely what blurs
away the sharp, hard edge between a black square and a white one that the reader is
straining to find in the first place.

## The small watchdogs that run on their own

A handful of small, automatic scripts sit quietly in the background of this whole
project: one lists every case where the exact same database recipe accidentally got
written down twice in two different places. One checks whether any recipe still refers to
a database column that no longer actually exists. One confirms a particular security
setting is wired up correctly everywhere it needs to be. One simply confirms the
application still starts up and actually serves a page. And one builds a realistic
practice dataset — printing out exactly what it *would* do first, and only actually
writing anything to the database if it's explicitly told to go ahead.

That last habit — describing the dangerous action out loud before ever taking it — is the
exact same instinct as the truncation flag from Part II.10: **make the genuinely
dangerous thing require a deliberate, full sentence of intent, never just one quick,
careless keystroke.**

---

# Part IV · The rap sheet

Every single item below genuinely happened, right here, on this actual project. They're
grouped by one single question, because it turns out to be the only sorting that actually
matters: what would have caught this?

A recipe inside the database that quietly referred to a column that no longer existed —
caught, eventually, by a dedicated script built specifically to look for it, and before
that, by whoever happened to actually use it and hit the failure firsthand. Completely
invisible to the type checker, to the automated tests, and to a normal deployment.

A different piece of code asking the database for a column by name, inside a plain string,
after that column had already been quietly removed — caught only by an actual customer
hitting a real error in production. The type checker had no way to see it at all.

The thousand-row ceiling silently cutting off a report's real data — caught only by
someone actually reading a number on screen and simply refusing to believe it, because
every single automated check in the project missed this one completely.

An error message from the database going completely unread and silently ignored — caught
by an automated linting rule, once someone finally went looking, at roughly fifty
separate places across the codebase. Invisible to the type checker and to the tests.

A unit mixed up somewhere — a color counted as a full pass through the press, a lift of
paper costed as though it moved sheet by sheet — caught only by actually running the real
math against a real invoice and comparing the two by hand. Nothing else in the whole
system was positioned to catch this at all.

A calculated rule sitting quietly in the code that, in practice, never actually fired for
anyone — caught only by someone stopping to genuinely ask *why not*, out loud. The tests
covering that exact rule had all been passing the entire time.

Two different screens quietly calculating the exact same underlying number in two
different ways — caught only by someone happening to notice the two answers didn't match.
The tests for each screen, individually, had both been passing.

A live deployment silently failing while the actual website kept working fine — caught
only by someone actually reading the deployment log itself. The working website gave
absolutely no outward sign anything at all was wrong.

And a number that happened to be wrong in the flattering direction — caught, eventually,
only by simple suspicion, and by a real human being actually sitting down and reviewing
it.

An honest summary from an audit conducted in July of 2026 still holds up today, word for
word:

> Every bug in that pass was invisible to every automated check the project had, and
> visible within seconds to anyone who opened the screen and asked what the numbers
> meant.

Every automated check mentioned throughout this whole document was genuinely worth
building, and plenty more have been added since that audit. But the one thing that
actually caught every single item on this entire list was a real person, looking at a
real screen, and simply refusing to accept that the shop genuinely had zero work to show
for an entire day.

---

# Part V · If you remember nothing else

Here's the short version, boiled all the way down. Roughly in the order these tend to
bite you.

Start by asking what actually breaks when a change ships — never just whether it
technically compiles or runs without an error. And whenever you have to stop someone from
moving forward, say exactly what's missing, specifically enough that they can go fix it
immediately, rather than vaguely enough that they have to go hunting for it themselves.
That said — block people only when something is genuinely impossible, never merely
because it's unfinished, and always leave the debt sitting somewhere visible, in front of
someone who's actually capable of paying it down.

Never let the same fact live in two separate places at once — because two stored copies
of one truth reliably turn into two conflicting truths, sooner rather than later. When you
genuinely need to know something for certain, go ask the actual source directly; searching
through code with a keyword can't see what's hiding inside a function or buried in a query
string. And whenever you find yourself doing the exact same manual check by hand for the
third time, turn it into a script instead — knowledge that only lives in a document
somewhere doesn't run itself the next time it's needed.

When you build a safeguard, favor being right every single time it speaks up over
catching slightly more at the cost of being wrong sometimes — a safeguard that cries wolf
too often gets switched off, and then you're left with nothing watching at all. Whenever
something has to fail, deliberately choose the failure you can actually recover from —
duplicate, visible data over silent, permanent loss, every single time. And when two
people might update the very same thing at the same moment, always guard that update
against the exact state you personally checked a moment earlier.

Never let a system quietly report only part of an answer as though it were the whole
thing — and if it genuinely doesn't know the complete picture, say so plainly instead of
guessing. Be instinctively more suspicious of any error that happens to make things look
better, not worse — that's precisely the direction nobody ever bothers to report on their
own.

If there are several different doors into the same process, that's completely fine — just
make sure none of them is ever allowed to demand something that rightfully belongs to a
different door. Work out an answer from whatever's already known and already written down
whenever you honestly can, and only stop to ask a real person when the situation is
genuinely, truly ambiguous — never just guess at someone's identity or intent.

Keep the actual rules pure and self-contained wherever you can, so the exact same
definition gets shared by the on-screen form and the final, official check behind it,
instead of two separate places quietly drifting apart from each other over time. Actually
measure the real numbers before you ever pick a limit out of thin air, and make sure
whatever error message follows names a choice the person reading it genuinely has the
power to make.

Write down the *why* behind a decision, and be honest about naming the scar it's actually
covering — so a safeguard never gets casually "simplified" straight back into the exact
bug it was built to prevent in the first place.

And underneath every single one of those: meet people where they actually already are —
wearing gloves, holding a phone, standing in front of a machine that's still running. If
whatever you build requires someone to stop and type, it simply will not get used, no
matter how correct it is on paper.

---

*Companion reading: `README.md` covers what the system actually does today. `NOTES.md` is
the incident log this whole document was quietly distilled out of, one hard lesson at a
time.*
