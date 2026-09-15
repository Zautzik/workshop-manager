// next.config.js refuses to build if NEXT_PUBLIC_DEV_BYPASS=true while
// NODE_ENV !== 'development' -- but it never asserts the positive: NODE_ENV
// could be 'development' by itself, an ambient variable nobody meant to set
// on a deployed project, and that check would not fire. This script never
// runs before `next dev` (only wired to `prebuild`), so if it's running at
// all, this IS a build -- NODE_ENV='development' here means someone set it
// explicitly on a deployed project, not that we're actually in local dev.
if (process.env.NODE_ENV === 'development') {
  console.error(
    'FATAL: NODE_ENV=development during `next build`. If this is a deployed ' +
      'project (Preview or Production), remove that project variable -- a build ' +
      'should never report itself as development.'
  );
  process.exit(1);
}

console.log(`NODE_ENV check passed (build context; NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}).`);
