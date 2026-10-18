// ESM resolve hook: lets Node resolve Vite-style extensionless relative
// imports (e.g. './dataTypes') used inside src/utils/*.js without editing src/.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err &&
      err.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      return await nextResolve(specifier + '.js', context);
    }
    throw err;
  }
}
