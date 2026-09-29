# Trader · Cuaderno de proceso — candidata V0.1

Aplicación funcional para revisar decisiones posteriores a una pérdida frente al plan del propio trader. F01–F06 de Fase 10. IA excluida por decisión explícita. Sin publicación autorizada.

- Alcance y convenciones: [docs/V0.1-SPEC.md](docs/V0.1-SPEC.md).
- Pruebas, auditoría, límites y freeze: [docs/V0.1-AUDIT.md](docs/V0.1-AUDIT.md).
- Datos estructurados: D1, con migración en drizzle/ y esquema en db/schema.ts.
- Comprobaciones: `node node_modules/typescript/bin/tsc --noEmit`, `npm run build`, `node --test tests/model.test.mjs tests/api.test.mjs`.
- La prueba de API se ejecuta contra el Worker ya construido y una base efímera. El código de producción requiere identidad autenticada; la identidad de prueba solo existe en desarrollo.

Para el desarrollo de Sites se utiliza el supervisor de vista previa de su entorno. No publicar ni cambiar la audiencia sin resolver la instrucción del usuario.
