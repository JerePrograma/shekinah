import categorySource from '../catalog-data/categories.json';
import { parseCategories } from '../catalog/model';

// Historical category options for pre-retirement administration only.
export const authorizedCategories = parseCategories(categorySource);
