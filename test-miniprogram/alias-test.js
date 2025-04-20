// This file imports using aliases to test the alias resolution feature
import { capitalize, formatDate } from '@utils/helpers';

// This one uses an alias path that exists in the tsconfig.json
console.log('Using utility functions:');
console.log('Formatted date:', formatDate(new Date()));
console.log('Capitalized text:', capitalize('hello world'));

// This reference will not be found if aliases are not enabled
export default {
  formatDate,
  capitalize
}; 