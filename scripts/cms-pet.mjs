// WRAPPER LEGADO — o motor real vive em cms-pages.mjs (multi-página).
// Mantido só para não quebrar imports antigos de applyPetCms/extractPet.
// Não adicionar lógica aqui: toda mudança de comportamento vai no cms-pages.mjs.
export { extractPet, applyPetCms, PAGES, extractPage, applyPageCms } from './cms-pages.mjs';
