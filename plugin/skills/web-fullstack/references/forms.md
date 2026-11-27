# Integrate forms and runtime schemas

Use compatible `@tanstack/vue-form` and `@oh-my-pi/omptype` only when the task needs managed forms and runtime schemas. Preserve suitable existing libraries. TanStack Form owns state and validation timing. The controls own presentation and interaction. The server still validates submitted data.

## Connect Standard Schema V1

Check the installed omptype exports and TanStack's current Vue API. omptype exposes `~standard`, so pass a schema directly to the form's validator rather than inventing an adapter:

```ts
import { type } from '@oh-my-pi/omptype'
import { useForm } from '@tanstack/vue-form'

const Account = type({
	profile: {
		email: 'string.email',
		name: type('string').pipe(value => value.trim()),
	},
})

const form = useForm({
	defaultValues: { profile: { email: '', name: '' } },
	validators: { onSubmit: Account },
	onSubmit: ({ value }) => {
		const parsed = Account(value)
		if (parsed instanceof type.errors) {
			return
		}
		submitAccount(parsed)
	},
})
```

`submitAccount` represents the task's real submission function, not a provided implementation. Handle submission-boundary errors visibly if parsing can fail there. For whitespace-only names, add a task-appropriate nonempty check after trimming. Defaults and transforms belong to the schema's output contract.

TanStack Form does not replace the input supplied to `onSubmit` with Standard Schema's transformed output. Explicitly parse at the submission boundary and use the returned validated output. Keep raw input and output types distinct, especially when converting strings to numbers or dates.

Bind nested fields by their actual path, such as `profile.email`, with `form.Field`. Forward value changes and blur to the field API. Connect the input's accessible label, `aria-invalid`, and `aria-describedby` to visible field errors. Standard Schema issue objects contain messages and paths. Render their message, not `[object Object]`. Deduplicate identical displayed messages when multiple validation timings report the same issue. Check the actual `field.state.meta.errors` shape and preserve nested paths instead of collapsing all errors into one form banner.

Use `@submit.prevent="form.handleSubmit"` on the form. Add native constraints where useful, but isolate schema proof with `novalidate` so browser validation cannot conceal a missing Standard Schema integration. Keep pending, invalid, and server-error states honest.

## Check browser execution and policy

omptype's published compiled ESM and declarations must bundle and typecheck in the target frontend. Bun's source export condition is not browser proof. Inspect the installed version, not only repository source.

The compiler wrappers catch `EvalError` and fall back to interpretation when code generation is blocked. Do not label strict CSP an automatic incompatibility or rely on an unproven `jitless` option. Never weaken CSP to accommodate a validator.

Exercise valid and nested-invalid input repeatedly, beyond the lazy compilation threshold. Under the actual policy, verify that results and error paths remain correct. If the app has no specified policy, use a clearly labelled production-asset fixture with `script-src 'self'` and no `unsafe-eval`. Record its scope separately from the application's deployment policy. Account for framework bootstrap hashes or nonces when testing SSR. A blocked compilation attempt can emit a CSP diagnostic even when the caught `EvalError` leaves validation functional. Report both observations accurately.

Complete proof includes a production build and typecheck, field-level nested-invalid errors, a valid submission, and visible evidence that transformed output reaches the submission consumer. Test ordinary controls and keyboard behavior through the app, not only direct schema calls. After invalid submission, correct the focused field and submit with Enter before blurring it. Choose validation timings that clear stale errors when input is corrected. Report unresolved bundling, types, error-path, or policy failures instead of silently switching validators.

## Sources

- [TanStack Vue validation](https://tanstack.com/form/latest/docs/framework/vue/guides/validation)
- [TanStack Vue submission handling](https://tanstack.com/form/latest/docs/framework/vue/guides/submission-handling)
- [omptype package and usage](https://github.com/can1357/oh-my-pi/tree/main/packages/omptype)
