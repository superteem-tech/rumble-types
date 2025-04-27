export * from './types.gen'

// alternative to the auto-generated ListOfXXX types
export type ListModel<T> = {
  totalItemCount: number
  items: Array<T>
}
